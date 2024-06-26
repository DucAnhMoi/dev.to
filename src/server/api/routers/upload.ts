'use strict';

import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import cloudinary from "@/server/cloudinary";
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface CloudinaryDeleteResponse {
  result: string;
}

const base64Regex = /^(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?$/;

export const uploadRouter = createTRPCRouter({
  uploadImage: protectedProcedure
    .input(z.object({
      file: z.string().refine(data => base64Regex.test(data), {
        message: "Invalid base64 string",
      }),
      fileName: z.string(),
      type: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { file, fileName, type } = input;
      const userId = ctx.session.user.id;
      const userName = ctx.session.user.name;
      const buffer = Buffer.from(file, 'base64');
      const tempFilePath = path.join('/tmp', `temp_${fileName}`);
      const folderName = `${type}_${userId}_${userName}`;

      try {
        await fs.promises.mkdir('/tmp', { recursive: true });

        await fs.promises.writeFile(tempFilePath, buffer);

        const result = await cloudinary.uploader.upload(tempFilePath, {
          public_id: type + "_" + 'tempFilePath' + "_" + uuidv4(),
          folder: folderName
        });

        if (!result) {
          throw new Error("Error: Upload failed");
        }

        await fs.promises.unlink(tempFilePath);

        return {
          image_url: result.secure_url,
          thumb_url: cloudinary.url(result.public_id, {
            height: 100,
            width: 100,
            format: 'jpg'
          }),
          public_id: result.public_id
        };
      } catch (err) {
        await fs.promises.unlink(tempFilePath).catch((err) => {console.log(err)});
        throw err;
      }
    }),

  deleteImage: protectedProcedure
    .input(z.object({
      public_id: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { public_id } = input;

      try {
        const result = await cloudinary.uploader.destroy(public_id) as CloudinaryDeleteResponse;

        if (result.result !== 'ok') {
          throw new Error(`Error: Deletion failed for public_id ${public_id}`);
        }

        return {
          message: `Image deleted successfully`,
          public_id: public_id
        };
      } catch (err) {
        throw err
      }
    }),
});
