import {getSql,noStore,bearer} from '../lib/db.js';
import {sessionUser} from '../lib/authutil.js';
import {ensureSchema} from '../lib/schema.js';
import {createPuantajHandler} from '../lib/puantaj-service.js';
export default createPuantajHandler({getSql,noStore,bearer,sessionUser,ensureSchema});
