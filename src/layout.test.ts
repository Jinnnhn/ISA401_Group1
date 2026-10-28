import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initial,clone,propose,valid} from './layout';
test('单件让位产生有效布局且不修改原始快照',()=>{const before=clone(initial);const r=propose(before,'sofa',0,.25);assert.equal(r.ok,true);assert.deepEqual(before,initial);assert.ok(r.items.every(f=>valid(f,r.items.filter(o=>o.id!==f.id))));assert.notDeepEqual(r.items.find(f=>f.id==='table'),initial[1]);assert.deepEqual(r.items.find(f=>f.id==='tv'),initial[2]);});
test('锁定家具阻止让位并保留整次快照',()=>{const data=clone(initial);data[1].locked=true;const r=propose(data,'sofa',0,.25);assert.equal(r.ok,false);assert.deepEqual(r.items,data);});
test('越界被拒绝',()=>assert.equal(propose(initial,'sofa',4,0).ok,false));
test('同一输入产生稳定的候选位置',()=>assert.deepEqual(propose(initial,'sofa',0,.25),propose(initial,'sofa',0,.25)));
test('锁定的拖动对象不可移动',()=>{const data=clone(initial);data[0].locked=true;assert.equal(propose(data,'sofa',0,1).ok,false);});
