-- Activa Row Level Security en todas las tablas del esquema public.
--
-- Por qué: Supabase expone el esquema public por HTTP (PostgREST) y la clave
-- pública (anon) viaja en el frontend. Sin RLS, cualquiera con esa clave podía
-- leer (y potencialmente escribir) Usuario, Permiso, lotes, etc. sin pasar por
-- el backend ni sus guards.
--
-- Sin ninguna política, anon y authenticated quedan sin acceso a las filas.
-- El backend NO se ve afectado: se conecta con el rol "postgres" (dueño de las
-- tablas, con BYPASSRLS). El frontend solo usa Supabase Auth y Storage, nunca
-- consulta estas tablas directamente.
--
-- Toda tabla nueva que cree una migración debe activar RLS acá mismo.
ALTER TABLE "Usuario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Permiso" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accesos_indicador" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accesos_iso" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "archivos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "carpetas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fabricantes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pedidos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plantillas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "productos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "registro_auditoria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trabajos_impresion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
