import type { ClientUploadsAccess } from '@payloadcms/plugin-cloud-storage/types'
import type { PayloadHandler } from 'payload'

import ky from 'ky'
import { APIError, Forbidden } from 'payload'

import type { BunnyAdapterOptions } from './types.js'

interface Args {
  access?: ClientUploadsAccess
  options: BunnyAdapterOptions
}

const defaultAccess: Args['access'] = ({ req }) => !!req.user

export const getClientUploadHandler = ({
  access = defaultAccess,
  options,
}: Args): PayloadHandler => {
  return async (req) => {
    if (!req.json) {
      throw new APIError('Content-Type expected to be application/json', 400)
    }

    const { collectionSlug, filename, isVideoFile, mimeType } = (await req.json()) as {
      collectionSlug: string
      filename: string
      isVideoFile: boolean
      mimeType: string
    }

    if (!(await access({ collectionSlug, req }))) {
      throw new Forbidden()
    }

    try {
      if (options.stream && isVideoFile) {
        // For video files, create a video in Bunny Stream first
        const { guid } = await ky
          .post<{ guid: string }>(`https://video.bunnycdn.com/library/${options.stream.libraryId}/videos`, {
            headers: {
              accept: 'application/json',
              AccessKey: options.stream.apiKey,
              'content-type': 'application/json',
            },
            json: { thumbnailTime: options.stream.thumbnailTime, title: filename },
            timeout: 120000,
          })
          .json()

        return Response.json({ videoId: guid })
      } else {
        // For regular files, no server action needed - client uploads directly
        return Response.json({ success: true })
      }
    } catch (error) {
      req.payload.logger.error({ error, msg: 'Failed to process client upload request' })
      throw new APIError('Failed to process upload request', 500)
    }
  }
}
