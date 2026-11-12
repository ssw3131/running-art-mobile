const listeners=new Set<()=>void>();
/** UI notification only after SQLite commits; polling still covers headless JS. */
export function recordingChanged(){for(const listener of listeners){try{listener();}catch{/* A view cannot interrupt recording. */}}}
export function subscribeRecording(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
