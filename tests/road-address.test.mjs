import test from 'node:test';
import assert from 'node:assert/strict';
import {roadAddress} from '../src/modules/map/road-address.ts';
test('road addresses omit house, apartment and postcode without losing numbered road names',()=>{
 assert.equal(roadAddress('대한민국, 서울특별시 종로구 세종대로 175, 03172'),'서울특별시 종로구 세종대로');
 assert.equal(roadAddress('서울특별시 강남구 테헤란로12길 23-4 101동'),'서울특별시 강남구 테헤란로12길');
 assert.equal(roadAddress('세종대로 175, 종로구, 서울특별시, 대한민국'),'서울특별시 종로구 세종대로');
 assert.equal(roadAddress('서울특별시 종로구 숭인동 230-1'),'서울특별시 종로구 숭인동');
 assert.equal(roadAddress('주소 확인 중…'),'주소 확인 중…');
});
