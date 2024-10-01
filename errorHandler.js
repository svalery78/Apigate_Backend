module.exports = (res, error) => {
  if ((error.name === 'MongoError' || error.name === 'MongoServerError') && error.code === 11000) {
    return res.status(422).json({ 
      status: 'ERROR',
      message: 'Пользователь уже существует' 
    });
  }

  if (error.response && error.response.status === 401) {
    return res.status(401).json({
      status: 'ERROR',
      message: 'Неверный логин/пароль'
    });
  }

  return res.status(422).send({
    status: 'ERROR',
    message: JSON.stringify(error)
  });
}