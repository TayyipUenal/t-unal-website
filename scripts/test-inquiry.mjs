import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Only targets the isolated local PHP test container. Mail is replaced by
// /bin/true in that container; this test never sends production email.
const url='http://127.0.0.1:8086/api/inquiry.php';
const input={name:'Technischer Test',email:'qa@example.com',company:'Test',phone:'',topic:'ISO 9001',message:'Dies ist ein lokaler technischer Funktionstest.',website:'',consent:'yes',requestId:randomUUID()};
const post=async(data,origin='https://tayyipuenal.de')=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(data)});
assert.equal((await fetch(url)).status,405);
assert.equal((await post(input,'https://foreign.example')).status,403);
assert.equal((await post({...input,consent:''})).status,422);
assert.equal((await post({...input,email:'test@example.com\r\nBcc: other@example.com'})).status,422);
assert.equal((await post({...input,website:'https://spam.example'})).status,422);
assert.equal((await fetch(url,{method:'POST',headers:{Origin:'https://tayyipuenal.de','Content-Type':'application/json'},body:'x'.repeat(21000)})).status,413);
const first=await post(input);assert.equal(first.status,200);const sent=await first.json();assert.equal(sent.ok,true);assert.match(sent.reference,/^TU-[A-F0-9]{8}$/);
const duplicate=await post(input);assert.equal(duplicate.status,200);assert.equal((await duplicate.json()).reference,sent.reference);
assert.equal((await post({...input,message:'Andere Angaben mit gleicher Anfragekennung.'})).status,409);
for(let i=0;i<4;i++)assert.equal((await post({...input,requestId:randomUUID()})).status,200);
assert.equal((await post({...input,requestId:randomUUID()})).status,429);
console.log('PASS: method, origin, validation, injection, honeypot, size, successful queue response, idempotency, conflict, rate limiting.');
