const userController = require('../controllers/user');
const cfg = require('../config');
const { isVerifiedPath } = require('../utils');

async function basicAuth(req, res, next) {
    
    // авторизация для фронта с токеном и систем типа 4me, которые не поддерживают авторизацию
    if (req.headers['x-access-token'] || req.path === cfg.paths.get('signin') || isVerifiedPath(req.url) && !req.headers.authorization) {
        return next();
    }

    // проверка наличия basic auth header
    if (!req.headers.authorization || req.headers.authorization.indexOf('Basic ') === -1) {
        return res.status(401).json({ 
            status: 'ERROR',
            message: 'Unauthorized'
        });
    }

    // verify auth credentials
    const base64Credentials = req.headers.authorization.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');
    const user = await userController.authenticate(username, password);
    if (!user) {
        return res.status(401).json({
            status: 'ERROR',
            message: 'Unauthorized' 
        });
    }

    req.user = user;

    next();
}

module.exports = basicAuth;