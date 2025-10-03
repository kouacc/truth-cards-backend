import Email from 'email-templates';
import * as path from 'node:path';

const config = {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
    auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
    },
    tls: {
        rejectUnauthorized: false,
    }
}

export const email = new Email({
    transport: config,
    message: {
        from: process.env.SMTP_FROM || '',
    },
    juice: true,
    juiceResources: {
        applyStyleTags: true,
        webResources: {
            relativeTo: path.resolve('./emails')
        }
    },
    preview: {
        open: true,
        openSimulator: false
    },
    send: process.env.NODE_ENV === 'production',
})