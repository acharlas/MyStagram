import type { NextConfig } from "next";

type ImagesConfig = NonNullable<NextConfig["images"]>;
type NextRemotePattern = Exclude<
  NonNullable<ImagesConfig["remotePatterns"]>[number],
  URL
>;

const nextConfig: NextConfig = (() => {
  const base =
    process.env.NEXT_PUBLIC_MINIO_BASE_URL ??
    "http://minio:9000/instagram-media";
  let images: NextConfig["images"] | undefined;

  try {
    const url = new URL(base);
    const protocol = url.protocol.replace(/:$/u, "");
    if (protocol !== "http" && protocol !== "https") {
      throw new Error("Unsupported image URL protocol");
    }

    const remotePattern: NextRemotePattern = {
      protocol,
      hostname: url.hostname,
      pathname: `${url.pathname.replace(/\/$/u, "")}/**`,
    };
    if (url.port) {
      remotePattern.port = url.port;
    }

    images = {
      remotePatterns: [remotePattern],
    };
  } catch {
    images = undefined;
  }

  return {
    images,
    experimental: {
      serverActions: {
        bodySizeLimit: "2mb",
      },
    },
  } satisfies NextConfig;
})();

export default nextConfig;
