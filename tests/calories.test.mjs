import assert from 'node:assert/strict';
import test from 'node:test';
import {parseWeightKg,validateWeightKg,estimatedRunningKcal} from '../src/modules/running/calories.ts';
import {validatePreferences,defaultAccountPreferences} from '../src/modules/account/model.ts';
import {createAccountRepository} from '../src/modules/account/repository.ts';
import {openSqlite} from './helpers/sqlite.mjs';
import {migrateDatabase} from '../src/modules/storage/migrations.ts';
test('body weight requires explicit validated kilograms, accepts comma/fullwidth, and can be cleared',()=>{
 assert.equal(parseWeightKg(''),undefined);assert.equal(parseWeightKg(' 65,5 '),65.5);assert.equal(parseWeightKg('７０．０'),70);
 for(const input of ['0','9.9','500.1','70.55','1e2','-70','70kg','NaN'])assert.throws(()=>parseWeightKg(input));
 for(const input of [null,'70',Infinity,NaN,70.55])assert.throws(()=>validateWeightKg(input));
 assert.deepEqual(validatePreferences(defaultAccountPreferences),defaultAccountPreferences);
});
test('calories use recorded metres and the explicit weight or user-approved 60kg default',()=>{
 assert.equal(estimatedRunningKcal(5200,70),364);assert.equal(estimatedRunningKcal(3000,65.5),197);
 assert.equal(estimatedRunningKcal(0,70),0);assert.equal(estimatedRunningKcal(3000,undefined),180);
 for(const [distance,weight] of [[-1,70],[NaN,70],[1000,0],[1000,Infinity],[1000,null]])assert.equal(estimatedRunningKcal(distance,weight),null);
});
test('weight persists only inside owned local preferences and can be removed without changing other settings',async t=>{
 const db=openSqlite(':memory:');t.after(()=>db.closeAsync());await migrateDatabase(db);
 let owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const account=createAccountRepository(db,()=>owner);
 const prefs={...defaultAccountPreferences,theme:'dark',weightKg:65.5};await account.savePreferences(prefs);
 owner='';assert.equal((await account.preferences()).weightKg,undefined);owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';assert.equal((await account.preferences()).weightKg,undefined);
 owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';assert.deepEqual(await account.preferences(),prefs);
 const {weightKg,...rest}=await account.preferences();await account.savePreferences(rest);assert.deepEqual(await account.preferences(),{...defaultAccountPreferences,theme:'dark'});
});
