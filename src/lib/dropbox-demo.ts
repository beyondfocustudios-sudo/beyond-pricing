export type DemoDeliveryFile = {
  id: string;
  title: string;
  fileType: "video" | "image" | "document";
  mimeType: string;
  createdAt: string;
  url: string;
  status: "new" | "approved" | "changes_requested";
};

const NOW = Date.now();

export const DEMO_DELIVERY_FILES: DemoDeliveryFile[] = [
  {
    id: "demo-video-1",
    title: "Teaser Evento Coimbra V2.mp4",
    fileType: "video",
    mimeType: "video/mp4",
    createdAt: new Date(NOW - 1000 * 60 * 60 * 6).toISOString(),
    url: "/demo/demo-video-1.mp4",
    status: "new",
  },
  {
    id: "demo-image-1",
    title: "Still Hero 01.jpg",
    fileType: "image",
    mimeType: "image/svg+xml",
    createdAt: new Date(NOW - 1000 * 60 * 60 * 20).toISOString(),
    url: "/demo/demo-image-1.svg",
    status: "new",
  },
  {
    id: "demo-image-2",
    title: "Still Hero 02.jpg",
    fileType: "image",
    mimeType: "image/svg+xml",
    createdAt: new Date(NOW - 1000 * 60 * 60 * 30).toISOString(),
    url: "/demo/demo-image-2.svg",
    status: "approved",
  },
  {
    id: "demo-image-3",
    title: "Still Backstage 03.jpg",
    fileType: "image",
    mimeType: "image/svg+xml",
    createdAt: new Date(NOW - 1000 * 60 * 60 * 40).toISOString(),
    url: "/demo/demo-image-3.svg",
    status: "changes_requested",
  },
  {
    id: "demo-doc-1",
    title: "Guiao Técnico.pdf",
    fileType: "document",
    mimeType: "application/pdf",
    createdAt: new Date(NOW - 1000 * 60 * 60 * 48).toISOString(),
    url: "/demo/demo-doc-1.pdf",
    status: "approved",
  },
  {
    id: "demo-doc-2",
    title: "Plano de Entrega Final.pdf",
    fileType: "document",
    mimeType: "application/pdf",
    createdAt: new Date(NOW - 1000 * 60 * 60 * 72).toISOString(),
    url: "/demo/demo-doc-2.pdf",
    status: "new",
  },
];

export function getDemoFileById(fileId: string) {
  return DEMO_DELIVERY_FILES.find((file) => file.id === fileId) ?? null;
}

export function toDemoPortalDeliverables(projectId: string) {
  return DEMO_DELIVERY_FILES.map((file, index) => ({
    id: `demo-deliverable-${index + 1}`,
    file_id: file.id,
    project_id: projectId,
    title: file.title,
    status: file.status,
    file_type: file.fileType,
    dropbox_url: file.url,
    created_at: file.createdAt,
    is_demo: true,
    mime_type: file.mimeType,
  }));
}
