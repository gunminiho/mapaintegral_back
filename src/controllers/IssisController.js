const redisClient = require("../redisClient");
const { deleteAlert } = require("../controllers/alertasController");

const getIssiInfo = async (id) => {
    try {
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }
        const point = await redisClient.hGetAll(`vigilancia:${id}`);
        if (id.length <= 5) { // si el id es menor o igual a 5 es una ISSI de radio, de lo contrario un member de celular
            const position = await redisClient.hGetAll(`unidades:${id}`);
            return { point, position };
        }
        const punto = await redisClient.geoPos("ubicaciones", id);
        // en turf funciona primero longitud y luego latitud al contrario de los mapas
        const position = { longitud: punto[0].latitude, latitud: punto[0].longitude }
        return { point, position };
    } catch (error) {
        console.error(`"Error en getIssiInfo: "${error.message}`);
        return null;
    }
}

const addIssi = async (issi, latitud, longitud, punto_index, feature_index, options) => {
    //console.log("addIssi: ", issi, latitud, longitud, punto_index, feature_index, options);
    if (!redisClient.isOpen) {
        await redisClient.connect();
    }
    const serializedOptions = JSON.stringify(options);
    try {
        const response = await redisClient.hSet(`vigilancia:${issi}`, {
            latitud: latitud,
            longitud: longitud,
            punto_index: punto_index,
            feature_index: feature_index,
            options: serializedOptions
        });
        //console.log("addIssi response: ", response);
        return response;
    } catch (error) {
        console.error(error);
        return false;
    }
}


const getPointInfo = async (latitud, longitud) => {

    try {
        if (!redisClient.isOpen)
            await redisClient.connect();
        const keys = await redisClient.keys("vigilancia:*");
        const issisMatched = [];
        for (const key of keys) {
            const issi = key.split(":")[1];
            const { latitude, longitude } = await redisClient.hGetAll(key);
            if (latitude == latitud && longitude == longitud)
                issisMatched.push(issi);
        }
        //console.log("MATCH: ", issisMatched);
        if (issisMatched.length > 0)
            return issisMatched;
        else
            return null;
    } catch (error) {
        console.error("Error verificando ISSIs por ubicación:", error);
        return false;

    }

};

const deleteIssiFromPoint = async (issi, alertid) => {

    if (!redisClient.isOpen)
        await redisClient.connect();

    try {
        // Caso 1: Eliminar una ISSI específica si se proporciona
        if (issi) {
            // Eliminar la ISSI de Redis
            const response = await redisClient.del(`vigilancia:${issi}`);
            // Eliminar la alerta asociada en la base de datos (si corresponde)
            await deleteAlert(issi);
            // Publicar un mensaje en el canal para que el master elimine la alerta
            const alertObject = {
                action: 'delete',
                issi: issi,
                alertid: alertid // O el ID de la alerta si lo tienes
            };
            await redisClient.publish('alerts_channel', JSON.stringify(alertObject));
            return response > 0 ? response : null; // Retorna el número de eliminaciones o null si no se eliminó nada

        } else {
            // Caso 2: Eliminar todas las ISSIs
            const keys = await redisClient.keys(`vigilancia:*`);
            if (keys.length > 0) {
                const response = await redisClient.del(keys);
                for (const key of keys) {
                    const issi = key.split(":")[1];
                    await deleteAlert(issi);
                    await redisClient.del(`vigilancia:${issi}`);
                }

                // Publicar un mensaje para que el master elimine todas las alertas
                const alertObject = {
                    action: 'deleteAll'
                };
                await redisClient.publish('alerts_channel', JSON.stringify(alertObject));

                return response; // Retorna el número de eliminaciones o null si no se eliminó nada
            } else {
                return null; // Retorna null si no había claves que eliminar
            }
        }
    } catch (error) {
        console.error("Error al eliminar ISSI(s):", error);
        return false;
    }
};




module.exports = { getIssiInfo, addIssi, getPointInfo, deleteIssiFromPoint };