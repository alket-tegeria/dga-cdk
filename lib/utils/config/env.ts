import z from 'zod'

const envSchema = z.object({
  STAGE: z.enum(['prod', 'staging', 'sandbox']),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error'])
})

export const EnvSchema = z.compile(envSchema)