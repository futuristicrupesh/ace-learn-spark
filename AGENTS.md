<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Lessons are generated in two steps (grounded chapter map, then per-part writing with a quality score) and good parts are saved in `lecture_cache` (service-role only) — keeps every topic specific and avoids re-spending students' AI quota.
- Lite Gemini models stay last in every model list and lessons from them are never cached — they produce shallow content when a key's daily quota on stronger models runs out.
