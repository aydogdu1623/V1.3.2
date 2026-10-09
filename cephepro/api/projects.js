import {getSql,noStore,bearer} from '../lib/db.js';
import {ensureSchema} from '../lib/schema.js';
import {sessionUser} from '../lib/authutil.js';
import {createProjectsHandler} from '../lib/projects-service.js';
export default createProjectsHandler({getSql,noStore,bearer,ensureSchema,sessionUser});
