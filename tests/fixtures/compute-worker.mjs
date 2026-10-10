import { parentPort } from 'node:worker_threads';
parentPort.on('message', message => {
  if (message === 'hang') while (true) { /* Test terminating CPU work. */ }
  if (message === 'crash') process.exit(1);
  parentPort.postMessage({ok:true,value:message});
});
