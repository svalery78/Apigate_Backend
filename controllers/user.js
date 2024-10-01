const UserModel = require('../models/user');
const errorHandler = require('../errorHandler.js');
const ObjectId = require('mongodb').ObjectId;
const bcrypt = require('bcrypt')
const cfg = require('../config');
const jwt = require('jsonwebtoken');
const { getPagination, prepareSearchParams, stringify } = require('../utils');
const logger = require('../middlewares/logger');

// аутентификация пользователя
const authenticate = async (login, password, userId) => {
  const findInMongoParam = login && password ? { login } : userId;
  let user = await UserModel.model.findOne(findInMongoParam);

  if (!user) {
    return false;
  }

  if (login && password) {
    const passwordIsValid = bcrypt.compareSync(
      password,
      user.password
    );

    if (!passwordIsValid) {
      return false
    }
  }

  return user
}

// Авторизация пользователя на фронте
const signinUser = async (req, res) => {
  try {
    //return errorHandler(res, 'TEST');
    const { login, password, userId } = req.body;
    if (!userId && (!login || !password)) {
      return errorHandler(res, 'Ошибка входа: Не получена информация о пользователе');
    }
    //Если произошла перезагрузка страницы или открытие в новой вкладке, сюда придет только userId
    const user = await authenticate(login, password, userId);

    if (user) {
      const authToken = jwt.sign({ userId: user._id }, cfg.secret, { expiresIn: cfg.sessionExpire }); //, userRole: user.role

      return res.json({
        success: true,
        user: {
          id: user._id,
          login: user.login,
          role: user.role,
          accessToken: authToken,
        }
      })
    } else {
      res.status(401).send({ message: 'Некорректный логин/пароль на портале' });
    }
  } catch (e) {
    res.status(401).send({ message: 'Некорректный логин/пароль на портале' });
  }
}

//logout
const signoutUser = async function (req, res) {
  req.session = null;

  res.status(200).send({
    success: true
  });
};

// Регистрация пользователя
const signupUser = async (req, res) => {
  try {
    const login = req.body.login || 'login';
    const password = req.body.password;
    const role = req.body.role;
    const whiteList = req.body.whiteList;
    const authType = req.body.authType;

    let user = await UserModel.model.findOne({ login: login })

    //регистрация
    const salt = bcrypt.genSaltSync(10);
    user = new UserModel.model({
      login: login,
      password: bcrypt.hashSync(password, salt),
      role: role,
      whiteList: whiteList,
      authType: authType
    });

    await user.save();

    res.send({
      id: user._id
    });

  } catch (e) {
    console.log('e=',e)
    errorHandler(res, e)
  }
};
/**
 * Сохранение пользователя
 * @param {Object} req
 * @param {Object} res
 */
const saveUser = async function (req, res) {
  try {
    const id = req.params.id;
    const login = req.body.login;
    const password = req.body.password;
    const role = req.body.role;
    const whiteList = req.body.whiteList;
    const authType = req.body.authType;

    if (id) {
      // ищем пользователя по id, если найдено - обновляем
      let user = await UserModel.model.findOne({ '_id': new ObjectId(id) });

      const salt = bcrypt.genSaltSync(10);

      if (user) {
        // обновляем
        user.login = login;
        user.password = bcrypt.hashSync(password, salt);
        user.role = role;
        user.whiteList = whiteList;
        user.authType = authType;

        await user.save();

        res.send({
          id: id
        });
      } else {
        return res.status(400).send({ status: 'ERROR', message: 'Пользователь с кодом ' + id + ' не найден' });
      }
    } else {
      return res.status(400).send({ status: 'ERROR', message: 'Не передан код Пользователь' });
    }
  } catch (e) {
    console.log('e=',e)
    errorHandler(res, e)
    // res.status(500).send({
    //   status: 'ERROR',
    //   message: error.message
    // });
  }
};
/**
 * Получение пользователя
 * @param {Object} req
 * @param {Object} res
 */
const getUser = async function (req, res) {
  try {
    const id = req.params.id;
    const user = await UserModel.model.findOne({ '_id': new ObjectId(id) });

    if (user) {
      res.send(user);
    } else {
      res.status(400).send({ status: 'ERROR', message: `Пользователь с кодом ${id} не найден` });
    }

  } catch (error) {
    logger.error(`Метод getUser Пользователь с кодом ${id} не найден`);
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};

/**
 * Получение списка записей с пагинацией и поиском 
 * @param {Object} req
 * @param {Object} res
 */
const getUserList = async function (req, res) {
  const { page, size } = req.body;
  let searchParams = req.body.searchParams || {};
  searchParams = prepareSearchParams(searchParams, UserModel.scheme.obj);

  try {
    const { limit, offset } = getPagination(page, size);

    UserModel.model.paginate(searchParams, { offset, limit, sort: { 'createdAt': -1 } })
      .then((data) => {
        res.send({
          totalItems: data.totalDocs,
          data: data.docs,
          totalPages: data.totalPages,
          currentPage: data.page - 1,
        });
      })
      .catch((error) => {
        logger.error(`Метод getUserList page=${page} size=${size} searchParams=${stringify(searchParams)} - ${stringify(error)}`);
        res.status(500).send({
          status: 'ERROR',
          message: error.message || 'Ошибка получения записей',
        });
      });

  } catch (error) {
    logger.error(`Метод getUserList page=${page} size=${size} searchParams=${stringify(searchParams)} - ${stringify(error)}`);
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};

module.exports = {
  signinUser,
  signoutUser,
  signupUser,
  saveUser,
  getUser,
  authenticate,
  getUserList
}