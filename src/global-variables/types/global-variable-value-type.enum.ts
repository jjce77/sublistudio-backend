// Coincide con el CHECK implícito de `GlobalVariable.valueType` en prisma/schema.prisma.
// "SCALAR": el valor de negocio real va envuelto como { value: <escalar> } (ver comentario en
// el schema) — se envuelve porque la columna física es JSON en los 4 motores soportados, y un
// escalar suelto (ej. el número 50) no es un documento JSON válido en todos ellos.
// "JSON": el valor de negocio real ES el objeto/array guardado en la columna, sin envoltura.
export enum GlobalVariableValueType {
  SCALAR = 'SCALAR',
  JSON = 'JSON',
}
