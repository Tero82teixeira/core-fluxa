import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {propertyFormSchema,emptyPropertyForm,parsePropertyDecimal,canWriteProperties} from '../src/lib/real-estate.ts';
import {routeVisibleForModules,workspaceHomeForSegment,MODULE_CATALOG} from '../src/lib/organization-segments.ts';
import {navItemVisibleForRole} from '../src/lib/navigation.ts';
const valid=()=>({...emptyPropertyForm(),code:' imov-001 ',title:' Casa teste ',owner_client_id:'00000000-0000-0000-0000-000000000020',street:'Rua teste',city:'Anchieta',state:'ES',sale_price:'250000,00'});
describe('Imobiliária: formulário e acesso',()=>{
 it('normaliza código e preços sem interpretar agrupamento ou expoente',()=>{
  const v=propertyFormSchema.parse(valid());assert.equal(v.code,'IMOV-001');assert.equal(v.sale_price,250000);assert.equal(v.rent_price,null);assert.equal(v.title,'Casa teste');
  assert.equal(parsePropertyDecimal('1500,50'),1500.5);assert.equal(parsePropertyDecimal(''),null);
  for(const value of ['-1','0','1e3','250.000,00','NaN','Infinity','10.001'])assert.throws(()=>parsePropertyDecimal(value));
 });
 it('exige proprietário, endereço e valor coerente com a finalidade',()=>{
  for(const patch of [{owner_client_id:''},{city:''},{state:'XX'},{sale_price:''},{zip_code:'12'},{purpose:'locacao',rent_price:''},{purpose:'venda_locacao',rent_price:''},{status:'alugado'}])assert.equal(propertyFormSchema.safeParse({...valid(),...patch}).success,false);
  const rental=propertyFormSchema.parse({...valid(),purpose:'locacao',rent_price:'1500,00',status:'alugado'});assert.equal(rental.sale_price,null);assert.equal(rental.rent_price,1500);
 });
 it('só habilita a rota para Imobiliária e módulo ligado, preservando outras áreas',()=>{
  assert.equal(MODULE_CATALOG.find(m=>m.key==='real_estate_workspace').available,true);
  assert.equal(routeVisibleForModules('/imobiliaria/imoveis','real_estate',[]),true);
  assert.equal(routeVisibleForModules('/imobiliaria/imoveis','real_estate',['clients']),false);
  for(const area of ['health','legal','other'])assert.equal(routeVisibleForModules('/imobiliaria/imoveis',area,[]),false);
  assert.equal(routeVisibleForModules('/saude/agenda','real_estate',[]),false);
  assert.equal(routeVisibleForModules('/advocacia/painel-juridico','real_estate',[]),false);
  assert.equal(workspaceHomeForSegment('real_estate',[]),'/imobiliaria/imoveis');
 });
 it('oferece leitura a perfis internos e restringe escrita e cliente externo',()=>{
  for(const role of ['proprietario','administrador','gestor','operacional'])assert.equal(canWriteProperties(role),true);
  for(const role of ['atendimento','financeiro','visualizador','cliente_externo',null])assert.equal(canWriteProperties(role),false);
  assert.equal(navItemVisibleForRole('/imobiliaria/imoveis','visualizador'),true);
  assert.equal(navItemVisibleForRole('/imobiliaria/imoveis','cliente_externo'),false);
 });
});
