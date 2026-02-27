"use client";

import { useParams } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import Image from 'next/image';

type Version = {
    id: string;
    version?: number | null;
    version_number?: number | null;
    file_url?: string | null;
    file_type?: string | null;
    created_at: string;
};
type Thread = {
    id: string;
    timecode_seconds?: number | null;
    status: "open" | "resolved";
    review_comments: Array<{
        id: string;
        body: string;
        guest_name?: string | null;
        created_at: string;
    }>;};
type LinkPayload = {
    deliverable: {
        id: string;
        title: string;
        status?: string | null;
    };
    link: {
        expiresAt: string;
        hasPassword: boolean;
        allowGuestComments: boolean;
    };
    versions: Version[];
    selectedVersionId: string | null;
    threads: Thread[];
};

export default function PublicReviewLinkPage() {
    const { token } = useParams<{ token: string }>();

    /**
     * Resto do código ...
     * Se precisar continuar ou se quiser apenas testar, coloque seus métodos abaixo.
     */
    return <div> Conteúdo do Review Link </div>;
}