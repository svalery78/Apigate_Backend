const getEnvironment = (envSystemVariable) => {
   switch (envSystemVariable) {
      case 'test':
      case 'production':
      case 'work':
      case 'sandbox':
         return envSystemVariable;
      default:
         return 'localhost';
   }
}

const getLogFolder = (envSystemVariable) => {
   switch (envSystemVariable) {
      case 'test':
      case 'production':
      case 'work':
      case 'sandbox':
         return '/data/logs';
      default:
         return 'logs';
   }
}

const getDBAddress = (environment) => {
   //Учетки для подключения к Mongo
   const MONGO_URLS = new Map();
   MONGO_URLS.set('LOCAL', 'mongodb://localhost:27017/apiGate?readPreference=primary');
   MONGO_URLS.set('DOCKER', 'mongodb://dba:mymongodb@mongo-srv:27017/apiGate?authSource=admin');

   switch (environment) {
      case 'test':
      case 'production':
      case 'work':
      case 'sandbox':
         return MONGO_URLS.get('DOCKER');
      default:
         return MONGO_URLS.get('LOCAL')
   }
}

const getEnvironmentMeta = (environment) => {
   return {
      baseUrl: '/sysrouter/',
      mongoUrl: getDBAddress(environment)
   };
}

const envMeta = getEnvironmentMeta(getEnvironment(process.env.APIGATE_BACK_ENV));

const PATHS = new Map();
// для интеграции 4me
PATHS.set('objectChangeStatus4me', envMeta.baseUrl + 'trusted/4me/object/objectChangeStatus');
PATHS.set('object4me', envMeta.baseUrl + 'trusted/4me/object/:id?');
// действия доступные системе
PATHS.set('object', envMeta.baseUrl + 'object/:id?');
PATHS.set('objectChangeStatus', envMeta.baseUrl + 'object/changeStatus/:id?');
// действия доступные админу 
PATHS.set('rest', envMeta.baseUrl + 'rest/:id?');
PATHS.set('stp', envMeta.baseUrl + 'stp/:id?');
PATHS.set('resending', envMeta.baseUrl + 'resending/:id?'); // 77017
PATHS.set('system', envMeta.baseUrl + 'system/:id?');
PATHS.set('user', envMeta.baseUrl + 'user/:id?');
PATHS.set('setting', envMeta.baseUrl + 'setting/:id?');
PATHS.set('signin', envMeta.baseUrl + 'signin');
PATHS.set('signup', envMeta.baseUrl + 'signup');
PATHS.set('signout', envMeta.baseUrl + 'signout');
PATHS.set('objectList', envMeta.baseUrl + 'objectList');
PATHS.set('restList', envMeta.baseUrl + 'restList');
PATHS.set('stpList', envMeta.baseUrl + 'stpList');
PATHS.set('resendingList', envMeta.baseUrl + 'resendingList'); // 77017
PATHS.set('userList', envMeta.baseUrl + 'userList');
PATHS.set('systemList', envMeta.baseUrl + 'systemList');
PATHS.set('settingList', envMeta.baseUrl + 'settingList');
PATHS.set('repeatRequest', envMeta.baseUrl + 'repeatRequest');
//PATHS.set('attachment', envMeta.baseUrl + 'attachment');

const CONNECTION_PARAMS = {
   mongoUrl: envMeta.mongoUrl,
   port: process.env.APIGATE_BACK_PORT || 13081,
   paths: PATHS,
   agenda: {
      database: {
         address: getDBAddress(getEnvironment(process.env.APIGATE_BACK_ENV)),
         collection: 'agendaJobs',
         options: {
            connectTimeoutMS: 120000,
            serverSelectionTimeoutMS: 120000
         }
      }
   },
   secret: "^%U7&9#INdsRxPtfhf*$Vml17",
   // secret: "api-gate-secket-key", 
   sessionExpire: 86400,
   logFolder: getLogFolder(process.env.APIGATE_BACK_ENV),
   logMaxSize: 52428800, //50mb
   //logMaxSize: 10240, // 10kb for test purpose
   logMaxFiles: '5',
   rejectUnauthorized: true,
   //filesUploadPath: 'uploads/'
}

module.exports = CONNECTION_PARAMS;