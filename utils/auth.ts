import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/drizzle";
import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { admin, username } from "better-auth/plugins"
import { passkey } from "better-auth/plugins/passkey"
import { email } from "./email";
import badwords from 'french-badwords-list';

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
    }),
    appName: "truth-cards-backend",
    trustedOrigins: [process.env.NODE_ENV === 'production' ? 'https://admin.truthcards.maxencelallemand.fr' : 'http://localhost:5173', "https://appleid.apple.com", "truthcards://"],
    plugins: [
        expo(), 
        username({
            usernameValidator: (username) => {
                if (!username) {
                    return false
                }

                if (badwords.regex.test(username)) {
                    return false
                }

                return true
            },
        }), 
        passkey({
            rpName: "Truth Cards",
            rpID: "admin.truthcards.maxencelallemand.fr",
            origin: [process.env.NODE_ENV === "production" ? "https://admin.truthcards.maxencelallemand.fr" : "http://localhost:5173", "https://api.truthcards.maxencelallemand.fr"],
        }), 
        admin({
            bannedUserMessage: "Votre compte a été banni.",
            
        })
    ],
    emailAndPassword: {
        enabled: true,
        minPasswordLength: 8,
        maxPasswordLength: 128,
        sendResetPassword: async ({user, url}) => {
            await email.send({
                template: 'reset-password',
                message: {
                    to: user.email
                },
                locals: {
                    name: user.name,
                    url: url
                }
            })
        },
    },
    emailVerification: {
        sendVerificationEmail: async ({user, url}) => {
            await email.send({
                template: 'verify-email',
                message: {
                    to: user.email
                },
                locals: {
                    name: user.name,
                    url: url
                }
            })
        },
        autoSignInAfterVerification: true,
        sendOnSignUp: true,
    },
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
            mapProfileToUser: (profile) => {
                return {
                    email: profile.email,
                    name: profile.name,
                    image: profile.picture,
                    emailVerified: profile.email_verified,
                }
            }
        },
        apple: {
            clientId: process.env.APPLE_CLIENT_ID || '',
            clientSecret: process.env.APPLE_CLIENT_SECRET || '',
            appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER || '',
            mapProfileToUser: (profile) => {
                return {
                    email: profile.email,
                    name: profile.user?.name.firstName || profile.name,
                    image: profile.picture,
                }
            }
        }
    },
    advanced: {
        cookiePrefix: "truthcards"
    },
    user: {
        deleteUser: {
            enabled: true,
            // TODO: supprimer les données utilisateur
            /* beforeDelete: async ({user}) => {
                await db.
            }, */
            sendDeleteAccountVerification: async ({user, url, token}) => {
                await email.send({
                    template: 'delete-account',
                message: {
                    to: user.email
                },
                locals: {
                    name: user.name,
                    url: url
                }
                })
            }
        },
    },
});
