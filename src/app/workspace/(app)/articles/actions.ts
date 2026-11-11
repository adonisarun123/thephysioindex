"use server";

import { revalidatePath } from "next/cache";
import { discardOwnDraft, parseArticleForm, saveOwnArticle, withdrawOwnArticle } from "@/lib/workspace/articles";
import { requireManage } from "@/lib/workspace/context";
import { bool, done, failTo, str } from "@/lib/workspace/forms";

const PAGE = "/workspace/articles";

/** Save a draft or send it to moderation. The practitioner is resolved on the server (IAM-01). */
export async function saveArticleAction(formData: FormData) {
  const articleId = str(formData, "articleId") || null;
  const submit = str(formData, "intent") === "submit";
  let id: string;
  try {
    const { viewer, practitioner } = await requireManage();
    ({ id } = await saveOwnArticle(
      { practitionerId: practitioner.id, practitionerPublicId: practitioner.publicId, practitionerName: practitioner.displayName, listingStatus: practitioner.listingStatus, userId: viewer.userId },
      articleId,
      parseArticleForm(formData),
      { submit, declared: bool(formData, "declared") },
    ));
    revalidatePath(PAGE);
    revalidatePath("/admin/content/blog");
  } catch (err) {
    failTo(articleId ? `${PAGE}/${articleId}` : `${PAGE}/new`, err);
  }
  if (submit) done(PAGE, { ok: "Sent for review. It goes live once our team approves it; you will see the result on this page." });
  done(`${PAGE}/${id}`, { ok: "Draft saved." });
}

export async function withdrawArticleAction(formData: FormData) {
  const articleId = str(formData, "articleId");
  try {
    const { viewer, practitioner } = await requireManage();
    const { slug, wasPublished } = await withdrawOwnArticle({ practitionerId: practitioner.id, userId: viewer.userId }, articleId);
    revalidatePath(PAGE);
    if (wasPublished) {
      // SEO-05: the public copies go at once.
      revalidatePath("/blog");
      revalidatePath(`/blog/${slug}`);
      revalidatePath("/blog/feed.xml");
      revalidatePath("/sitemaps/content.xml");
      revalidatePath(`/physiotherapist/${practitioner.slug}-${practitioner.publicId}`);
    }
  } catch (err) {
    failTo(PAGE, err);
  }
  done(PAGE, { ok: "Done. You can edit the article and send it again." });
}

export async function discardArticleAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    await discardOwnDraft({ practitionerId: practitioner.id, userId: viewer.userId }, str(formData, "articleId"));
    revalidatePath(PAGE);
  } catch (err) {
    failTo(PAGE, err);
  }
  done(PAGE, { ok: "Draft discarded." });
}
