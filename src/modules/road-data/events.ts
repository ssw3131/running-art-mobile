const versions=new Map<string,string>();
const listeners=new Set<()=>void>();
export function observeRoadVersion(source:string,version:string){const previous=versions.get(source);versions.set(source,version);if(previous&&previous!==version)for(const listener of listeners)listener();}
export function onRoadVersionChange(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener);}
