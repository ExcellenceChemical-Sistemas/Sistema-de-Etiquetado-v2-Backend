-- Deja el bucket "avatars" en solo lectura pública para los clientes de Supabase.
--
-- Las fotos de perfil ahora se suben por el backend (POST /usuarios/me/avatar,
-- con la clave de servicio, que ignora RLS). Las políticas de escritura para el
-- rol "authenticated" ya no hacen falta y eran un problema: dos de ellas solo
-- revisaban que el bucket fuera "avatars", así que cualquier usuario logueado
-- podía subir o pisar la foto de otro (las políticas se suman con OR, por lo que
-- las "estrictas" por carpeta nunca llegaron a proteger nada).
--
-- Orden de despliegue: publicar backend Y frontend nuevos antes de aplicar esta
-- migración; un frontend viejo sube directo a Storage y dejaría de poder hacerlo.
--
-- El bloque DO evita que falle donde no existe el esquema "storage" (por ejemplo
-- la base sombra que usa `prisma migrate dev`).
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "usuarios suben su propio avatar" ON storage.objects;
    DROP POLICY IF EXISTS "usuarios actualizan su propio avatar" ON storage.objects;
    DROP POLICY IF EXISTS "usuarios borran su propio avatar" ON storage.objects;
    DROP POLICY IF EXISTS "Usuarios pueden subir su avatar" ON storage.objects;
    DROP POLICY IF EXISTS "Usuarios pueden actualizar su avatar" ON storage.objects;
    -- Duplicada de "lectura publica de avatars", que se conserva.
    DROP POLICY IF EXISTS "Avatares son visibles públicamente" ON storage.objects;
  END IF;
END
$$;
