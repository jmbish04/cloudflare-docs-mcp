import Cloudflare from "cloudflare";
import type { Stream } from "stream";

// --- Parameter & Response Interfaces ---

export interface RenderSource { url?: string; html?: string; }
export interface ScreenshotParams extends RenderSource { screenshotOptions?: Cloudflare.BrowserRendering.Screenshot.ScreenshotOptions; viewport?: Cloudflare.BrowserRendering.Screenshot.Viewport; gotoOptions?: Cloudflare.BrowserRendering.Screenshot.GotoOptions; selector?: string; }
export interface PdfParams extends RenderSource { pdfOptions?: Cloudflare.BrowserRendering.Pdf.PdfOptions; viewport?: Cloudflare.BrowserRendering.Pdf.Viewport; gotoOptions?: Cloudflare.BrowserRendering.Pdf.GotoOptions; }
export interface SnapshotParams extends RenderSource { screenshotOptions?: Cloudflare.BrowserRendering.Snapshot.ScreenshotOptions; viewport?: Cloudflare.BrowserRendering.Snapshot.Viewport; gotoOptions?: Cloudflare.BrowserRendering.Snapshot.GotoOptions; }
export interface ScrapeParams extends RenderSource { elements: Cloudflare.BrowserRendering.Scrape.Element[]; }
export interface JsonParams extends RenderSource { prompt?: string; response_format?: Cloudflare.BrowserRendering.Json.ResponseFormat; custom_ai?: Cloudflare.BrowserRendering.Json.CustomAI[]; }
export interface LinksParams extends RenderSource { visibleLinksOnly?: boolean; excludeExternalLinks?: boolean; }
export interface MarkdownParams extends RenderSource {}

export class BrowserRender {
  private client: Cloudflare;
  private accountId: string;

  constructor(accountId: string, apiToken?: string) {
    if (!accountId) { throw new Error("Cloudflare account ID is required."); }
    this.accountId = accountId;
    this.client = new Cloudflare({ apiToken: apiToken || process.env.CLOUDFLARE_API_TOKEN });
  }

  public async takeScreenshot(params: ScreenshotParams): Promise<Stream> {
    const response = await this.client.browserRendering.screenshot.create({ account_id: this.accountId, ...params });
    return response.body as unknown as Stream;
  }

  public async generatePdf(params: PdfParams): Promise<Stream> {
    const response = await this.client.browserRendering.pdf.create({ account_id: this.accountId, ...params });
    return response.body as unknown as Stream;
  }

  public async takeSnapshot(params: SnapshotParams): Promise<Cloudflare.BrowserRendering.SnapshotCreateResponse> {
    return this.client.browserRendering.snapshot.create({ account_id: this.accountId, ...params });
  }
  
  public async scrape(params: ScrapeParams): Promise<Cloudflare.BrowserRendering.ScrapeCreateResponse> {
    return this.client.browserRendering.scrape.create({ account_id: this.accountId, ...params });
  }

  public async extractJson(params: JsonParams): Promise<Cloudflare.BrowserRendering.JsonCreateResponse> {
    return this.client.browserRendering.json.create({ account_id: this.accountId, ...params });
  }

  public async getLinks(params: LinksParams): Promise<Cloudflare.BrowserRendering.LinksCreateResponse> {
    return this.client.browserRendering.links.create({ account_id: this.accountId, ...params });
  }

  public async getMarkdown(params: MarkdownParams): Promise<Cloudflare.BrowserRendering.MarkdownCreateResponse> {
    return this.client.browserRendering.markdown.create({ account_id: this.accountId, ...params });
  }
}