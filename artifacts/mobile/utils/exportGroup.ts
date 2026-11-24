import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { buildCsv, buildHtml, type ExportInput } from "./exportFormat";

const slug = (name: string) => name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "group";

/** Builds the export and opens the share sheet (Files, Mail, WhatsApp, Drive...). */
export async function shareGroupExport(kind: "csv" | "pdf", input: ExportInput): Promise<void> {
  if (Platform.OS === "web") {
    if (kind === "pdf") {
      await Print.printAsync({ html: buildHtml(input) });
      return;
    }
    const doc = (globalThis as unknown as { document?: { createElement: (tag: string) => { href: string; download: string; click: () => void } } }).document;
    if (!doc) return;
    const url = URL.createObjectURL(new Blob([buildCsv(input)], { type: "text/csv" }));
    const link = doc.createElement("a");
    link.href = url;
    link.download = slug(input.groupName) + ".csv";
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  if (kind === "pdf") {
    const { uri } = await Print.printToFileAsync({ html: buildHtml(input) });
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: input.groupName });
    return;
  }
  const uri = FileSystem.cacheDirectory + slug(input.groupName) + "-" + input.generatedOn + ".csv";
  await FileSystem.writeAsStringAsync(uri, buildCsv(input), { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { mimeType: "text/csv", UTI: "public.comma-separated-values-text", dialogTitle: input.groupName });
}
