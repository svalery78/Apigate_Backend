const { default: PQueue } = require('p-queue');
//const queueConsecutive = new PQueue({ concurrency: 1 }); //Очередь последовательных запросов (отправляем по одному запросу)
const queues = {}; 
/* Объект с очередями для каждой системы (чаще всего у нас для каждой системы свой пользователь, 
    но может, теоретически, один и тот же пользователь использоваться для систем)
*/
/* 
    Если идет отправка запроса, следует отправлять этот запрос с использованием 
    очереди последовательных запросов, иначе есть риск возникновения дубрикатов сессий пользователя из-за получения нового запроса к SM, 
    пока не выполнился предыдущий
*/
const sendWithQueue = (apiMethod, systemId = 'unknownSystem') => {
    if (!queues[systemId]) { queues[systemId] = new PQueue({ concurrency: 1 }); }
    return queues[systemId].add(() => apiMethod());
    //return queueConsecutive.add(() => apiMethod());
}

module.exports = { sendWithQueue };