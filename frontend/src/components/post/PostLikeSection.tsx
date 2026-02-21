"use client";

import { useState } from "react";

import { LikeButton } from "@/components/post/LikeButton";
import { PostLikesPanel } from "@/components/post/PostLikesPanel";

type PostLikeSectionProps = {
  postId: number;
  initialLiked?: boolean;
  initialCount?: number;
};

export function PostLikeSection({
  postId,
  initialLiked = false,
  initialCount = 0,
}: PostLikeSectionProps) {
  const [isLikesPanelOpen, setIsLikesPanelOpen] = useState(false);

  return (
    <>
      <LikeButton
        postId={postId}
        initialLiked={initialLiked}
        initialCount={initialCount}
        onCountClick={() => setIsLikesPanelOpen(true)}
        countButtonAriaLabel="Voir les personnes qui ont aimé cette publication"
      />
      <PostLikesPanel
        postId={postId}
        isOpen={isLikesPanelOpen}
        onClose={() => setIsLikesPanelOpen(false)}
      />
    </>
  );
}
