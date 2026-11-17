import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { ContextSchema } from './context'
import { EnvSchema } from './env'

const account = process.env.CDK_DEFAULT_ACCOUNT
const region = process.env.AWS_REGION

if (!region || !account) {
  throw new Error('Region or account id not found!', {
    cause: { account, region }
  })
}

const envResult = EnvSchema.safeParse(process.env)

if (!envResult.success) {
  throw new Error(`Invalid .env:\n${z.prettifyError(envResult.error)}`)
}

export const env = {
  account,
  region,
  ...envResult.data
}

const rawData = fs.readFileSync(
  path.resolve(process.cwd(), 'cdk.context.json'),
  'utf8'
)

const contextResult = ContextSchema.safeParse(
  (JSON.parse(rawData) as Record<string, unknown>)[env.STAGE]
)

if (!contextResult.success) {
  throw new Error(
    `Invalid context.json [${env.STAGE}]:\n${z.prettifyError(contextResult.error)}`
  )
}

export const context = contextResult.data

console.log(`${account} | ${region} | ${env.STAGE}\n`)
