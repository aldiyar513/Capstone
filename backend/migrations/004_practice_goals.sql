begin;

create table public.practice_goals (
    id uuid primary key default gen_random_uuid(),

    piece_id uuid not null
        references public.pieces(id) on delete cascade,

    title text not null
        check (length(trim(title)) between 1 and 120),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index practice_goals_piece_created_idx
    on public.practice_goals(piece_id, created_at desc);

create trigger practice_goals_set_updated_at
before update on public.practice_goals
for each row
execute function public.set_updated_at();


-- Links existing passages to a goal without copying them.
create table public.practice_goal_passages (
    goal_id uuid not null
        references public.practice_goals(id) on delete cascade,

    passage_id uuid not null
        references public.passages(id) on delete cascade,

    created_at timestamptz not null default now(),

    primary key (goal_id, passage_id)
);

create index practice_goal_passages_passage_idx
    on public.practice_goal_passages(passage_id);


-- A goal and its linked passage must belong to the same piece.
create function public.check_goal_passage_piece()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    goal_piece_id uuid;
    passage_piece_id uuid;
begin
    select goal.piece_id
    into goal_piece_id
    from public.practice_goals as goal
    where goal.id = new.goal_id
    for share;

    select recording.piece_id
    into passage_piece_id
    from public.passages as passage
    join public.recordings as recording
        on recording.id = passage.recording_id
    where passage.id = new.passage_id
    for share of passage, recording;

    if goal_piece_id is null or passage_piece_id is null then
        raise exception 'Goal or passage does not exist.'
            using errcode = '23503';
    end if;

    if goal_piece_id <> passage_piece_id then
        raise exception 'Goal and passage must belong to the same piece.'
            using errcode = '23514';
    end if;

    return new;
end;
$$;

create trigger practice_goal_passages_check_piece
before insert or update on public.practice_goal_passages
for each row
execute function public.check_goal_passage_piece();


-- Access will go through Flask, with ownership checks.
-- No direct browser-access policies are added here.
alter table public.practice_goals enable row level security;
alter table public.practice_goal_passages enable row level security;

commit;