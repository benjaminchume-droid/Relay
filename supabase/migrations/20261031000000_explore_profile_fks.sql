-- Explore comment visibility fix: the client embeds `profiles:profile_id(...)`
-- on these tables; PostgREST returned PGRST200 because the FKs were missing,
-- comment/story fetches threw, and the UI showed "No replies yet" even though
-- rows existed. Apply: alter table add constraint ... (validated live, zero orphans).

alter table public.post_comments
  add constraint post_comments_profile_fk foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table public.posts
  add constraint posts_author_fk foreign key (author_id) references public.profiles(id) on delete cascade;

alter table public.story_replies
  add constraint story_replies_profile_fk foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table public.stories
  add constraint stories_profile_fk foreign key (profile_id) references public.profiles(id) on delete cascade;
