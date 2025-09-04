'use client'
import { createClientUploadHandler } from '@payloadcms/plugin-cloud-storage/client'

export type BunnyClientUploadHandlerExtra = {
  prefix: string
}

export const BunnyClientUploadHandler = createClientUploadHandler<BunnyClientUploadHandlerExtra>({
  handler: async ({
    apiRoute,
    collectionSlug,
    extra: { prefix = '' },
    file,
    serverHandlerPath,
    serverURL,
  }) => {
    // Create a FormData object to send the file
    const formData = new FormData()
    formData.append('file', file)
    formData.append('collectionSlug', collectionSlug)
    formData.append('filename', file.name)
    formData.append('mimeType', file.type)
    formData.append('prefix', prefix)

    // Upload through the server proxy to keep API keys secure
    const uploadResponse = await fetch(`${serverURL}${apiRoute}${serverHandlerPath}`, {
      body: formData,
      credentials: 'include',
      method: 'POST',
    })

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text()
      throw new Error(`Upload failed: ${error}`)
    }

    const result = await uploadResponse.json() as {
      bunnyVideoId?: string
    }

    // Return metadata for the upload
    return {
      bunnyVideoId: result.bunnyVideoId || null,
      prefix,
    }
  },
})
