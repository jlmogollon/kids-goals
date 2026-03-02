# Despliegue automático en Netlify

Cada vez que hagas **push** a tu repositorio, Netlify hará el build y actualizará el sitio automáticamente.

## 1. Subir el proyecto a GitHub

Si aún no tienes el proyecto en Git:

```bash
git init
git add .
git commit -m "Initial commit - Kids Goals"
```

Crea un repositorio nuevo en [GitHub](https://github.com/new) (por ejemplo `kids-goals`) y luego:

```bash
git remote add origin https://github.com/TU_USUARIO/kids-goals.git
git branch -M main
git push -u origin main
```

## 2. Conectar el repo con Netlify

1. Entra en [Netlify](https://app.netlify.com) e inicia sesión.
2. **Add new site** → **Import an existing project**.
3. Conecta **GitHub** y autoriza a Netlify.
4. Elige el repositorio **kids-goals**.
5. Netlify detectará `netlify.toml` y usará:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
6. Pulsa **Deploy site**.

## 3. Flujo automático a partir de ahora

- Editas código en tu PC (o en Cursor).
- Haces commit y push:
  ```bash
  git add .
  git commit -m "Descripción del cambio"
  git push
  ```
- Netlify hace el build y actualiza el sitio en unos segundos.

Puedes ver el estado de cada despliegue en el panel de Netlify → **Deploys**.
