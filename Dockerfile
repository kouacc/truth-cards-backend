# Utiliser l'image officielle Bun
FROM oven/bun:1.2-debian AS base

# Étape de construction des dépendances
FROM base AS deps
WORKDIR /app

# Copier les fichiers de dépendances
COPY package.json bun.lock ./

# Installer les dépendances de production et de développement
RUN bun install --frozen-lockfile

# Étape de construction
FROM base AS build
WORKDIR /app

# Copier les dépendances depuis l'étape précédente
COPY --from=deps /app/node_modules ./node_modules

# Copier tout le code source
COPY . .

# Générer les types TypeScript et vérifier la compilation
RUN bun run --bun tsc --noEmit

# Étape de production
FROM base AS production
WORKDIR /app

# Variables d'environnement
ENV NODE_ENV=production
ENV PORT=3000

# Créer un utilisateur non-privilégié
RUN groupadd --gid 1001 bunuser \
    && useradd --uid 1001 --gid bunuser --shell /bin/bash --create-home bunuser

# Copier les dépendances de production uniquement
COPY --from=deps --chown=bunuser:bunuser /app/node_modules ./node_modules
COPY --from=deps --chown=bunuser:bunuser /app/package.json ./package.json

# Copier le code source nécessaire
COPY --chown=bunuser:bunuser src ./src
COPY --chown=bunuser:bunuser utils ./utils
COPY --chown=bunuser:bunuser db ./db
COPY --chown=bunuser:bunuser emails ./emails
COPY --chown=bunuser:bunuser assets ./assets
COPY --chown=bunuser:bunuser migrate.ts ./
COPY --chown=bunuser:bunuser tsconfig.json ./
COPY --chown=bunuser:bunuser drizzle.config.ts ./

# Changer vers l'utilisateur non-privilégié
USER bunuser

# Exposer le port
EXPOSE 3000

# Commande de démarrage
CMD ["bun", "run", "src/index.ts"]