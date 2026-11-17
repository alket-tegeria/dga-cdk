import z from 'zod'

const pipelineSchema = z.object({
  deployBranch: z.string(),
  owner: z.string(),
  githubConnectionArn: z.string()
})

const networkSchema = z.object({
  vpcCidr: z.string()
})

const cdnSchema = z.object({
  certificateArn: z.string(),
  domainNames: z.array(z.string())
})

const contextSchema = z.object({
  network: networkSchema,
  cdn: cdnSchema.optional(),
  pipeline: pipelineSchema
})

export const ContextSchema = z.compile(contextSchema)
