// Vehicle models by id: each file exports build(THREE, def, { enhance }) -> { group, wheels, steer?, turret?, update(st) }.
// Adding a vehicle = data/vehicles.json entry + js/client/models/<id>.js.
const cache = new Map();
export async function loadModelBuilder(id) {
  if (!cache.has(id)) cache.set(id, import(`./${id}.js`).then(m => m.build));
  return cache.get(id);
}
export async function buildModel(THREE, def, opts) { return (await loadModelBuilder(def.id))(THREE, def, opts); }
