begin;

create temporary table passage_test_results (
    test_name text,
    expected text,
    actual text,
    status text
) on commit drop;

do $$
declare
    test_recording_id uuid;
    test_case record;
    actual_result text;
begin
    select id
    into test_recording_id
    from public.recordings
    where upload_status = 'ready'
      and duration_ms >= 1000
    limit 1;

    if test_recording_id is null then
        raise exception
            'A ready recording at least one second long is needed.';
    end if;

    for test_case in
        select *
        from (
            values
                ('Valid passage', 'Test passage', 0, 1000, 'Accepted'),
                ('Negative start', 'Test passage', -1, 1000, 'Rejected'),
                ('End before start', 'Test passage', 1000, 500, 'Rejected'),
                ('Equal start and end', 'Test passage', 500, 500, 'Rejected'),
                ('Blank label', '   ', 0, 1000, 'Rejected')
        ) as cases(test_name, label, start_ms, end_ms, expected)
    loop
        begin
            insert into public.passages (
                recording_id,
                label,
                start_ms,
                end_ms
            )
            values (
                test_recording_id,
                test_case.label,
                test_case.start_ms,
                test_case.end_ms
            );

            actual_result := 'Accepted';

        exception
            when check_violation then
                actual_result := 'Rejected';
        end;

        insert into passage_test_results
        values (
            test_case.test_name,
            test_case.expected,
            actual_result,
            case
                when actual_result = test_case.expected then 'PASS'
                else 'FAIL'
            end
        );
    end loop;
end;
$$;

select * from passage_test_results;

rollback;