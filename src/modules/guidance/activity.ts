// Process-local mutual exclusion. Simulation never changes the real run repository.
let simulationActive = false;
export const guidanceActivity = { active: () => simulationActive, set: (active: boolean) => { simulationActive = active; } };
