import axios from "axios";

function convertToRawUrl(url: string): string {

  if (url.includes("raw.githubusercontent.com")) {
    return url;
  }

  if (!url.includes("github.com") || !url.includes("/blob/")) {
    throw new Error("Invalid GitHub file URL");
  }

  return url
    .replace("https://github.com/", "https://raw.githubusercontent.com/")
    .replace("/blob/", "/");
}

export async function fetchGithubFile(url: string): Promise<string> {
  const rawUrl = convertToRawUrl(url);

  const response = await axios.get(rawUrl);

  if (!response.data) {
    throw new Error("Empty file from GitHub");
  }

  return response.data;
}
