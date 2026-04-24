import express from 'express'

import { listJobs } from '../lib/queue.mjs'

export const queueRouter = express.Router()

queueRouter.get('/', (_req, res) => {
  res.json({ jobs: listJobs() })
})
