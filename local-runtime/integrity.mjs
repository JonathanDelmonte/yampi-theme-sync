import path from 'node:path';
import {checkIntegrity} from './preview.mjs';
const root=path.resolve(import.meta.dirname,'../..');
try{console.log(JSON.stringify(await checkIntegrity(root),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
