import { db } from "./db/drizzle";
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { sql } from "drizzle-orm";

async function runMigrations() {
    try {
        console.log("🔍 Vérification de l'état de la base de données...");
        
        // Vérifier si la table des migrations existe
        const migrationTableExists = await db.execute(sql`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = '__drizzle_migrations'
            )
        `);
        
        const hasUserTable = await db.execute(sql`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'user'
            )
        `);

        if (migrationTableExists.rows[0].exists && hasUserTable.rows[0].exists) {
            console.log("✅ Base de données déjà initialisée, pas de migration nécessaire.");
            process.exit(0);
        }

        console.log("🚀 Exécution des migrations...");
        await migrate(db, { migrationsFolder: "./db/migrations" });
        console.log("✅ Migrations appliquées avec succès");
        process.exit(0);
    } catch (error) {
        console.error("❌ Erreur lors de l'exécution des migrations:", error);
        process.exit(1);
    }
}

runMigrations()