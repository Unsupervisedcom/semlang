# Language Naming: Research & Recommendations

## Context

We need a name for a declarative language for making functional ontologies for agents. The language:
- Incorporates semantic models of relational data (based closely on Malloy)
- Uses gUFO-style deeper semantics (kinds, events, situations, relators, phases)
- Includes function declarations, procedures, validations, and lenses
- Compiles to Malloy for execution
- Targets agent-driven reasoning about data

Currently called **SemLang** (working name).

### Naming Criteria
1. Unused or very fringe in the industry
2. Distinctive when Googled — first-page results should not be dominated by something else
3. Evocative of the language's purpose (ontology, semantics, data modeling, truth)
4. Memorable, pronounceable, easy to spell
5. 2-3 syllables preferred
6. Must NOT sound like a pharmaceutical name (no -alis, -idal, -il, -zole, etc.)

### Conceptual Directions
- **Heritage**: the language extends Malloy with semantics → "semantic + Malloy"
- **Fabric**: the language weaves a semantic fabric over data → "semantic fabric" / "weave"
- **Dialect**: the language is a way of speaking about ontology → "linguistic data layer" / "ontology dialect"
- **Foundation**: the language declares what things truly are → "truth" / "form" / "essence"

---

## Candidates Considered (with research)

### Discarded — Name Already Taken

| Name | Meaning | Conflict | Reason for Discard |
|------|---------|----------|-------------------|
| **Noema** | Husserl's term for the intentional object of thought | PyPI package "Noema" (declarative AI programming lib, Dec 2024); metalanguage for versionable hypertexts (Springer); noema type in Neut programming language | Three separate programming/CS usages. Would never own search results. |
| **Eidos** | Platonic term for essential form | Eidos scripting language (part of SLiM, Cornell); Eidos machine reading system (GitHub/clulab); multiple other GitHub repos using the name | Well-established scripting language in bioinformatics. Too crowded. |
| **Tessera** | Latin for mosaic piece / identity token | Tessera UI library (Rust, declarative); Tessera deep learning compiler; Tessera AI workspace (Claude Code organizer); Tessera game software; Brompton Tessera LED software | Extremely crowded. At least 5 active software projects. |
| **Kairos** | Greek for the opportune moment | Kairos AI platform; Kairos identity verification; Kairos macroprogramming system; Kairos Context Keeper; Kairos Haskell library | Heavily used across AI and software. Unsalvageable. |
| **Aletheia** | Greek for truth/disclosure (Heidegger) | Aletheia compile-to-JS programming language (GitHub); Aletheia scientific publishing platform; Aletheia steganalysis toolbox; npm package "aletheia" | Direct competitor — there's literally a programming language called Aletheia. |
| **Eidolon** | Greek for phantom/image | EidolonAI — AI Agent Server for the Enterprise (eidolonai.com); Eidolon biomedical viz framework; Eidolon Perl web framework; Eidolon engine | Especially bad: EidolonAI is an agent framework, directly overlapping our domain. |
| **Malleon** | Malloy + suffix | Malleon.io — session replay and test automation company | Active tech company with matching domain. |
| **Qualion** | Quality/quale + suffix | Qualion Intelligence — verifiable AI infrastructure for autonomous systems | Directly overlapping domain (AI reasoning, auditability). Worst possible collision. |
| **Entiq** | Entity + unique | Entiq AS — Norwegian IT company (acquired by Dynatos 2021) | Active tech company, indexed on Crunchbase. |

### Discarded — Partially Taken / Search Pollution

| Name | Meaning | Conflict | Reason for Discard |
|------|---------|----------|-------------------|
| **Qualis** | Latin for "of what kind" | Qualis healthcare company (qualis.com); Qualis CAPES — Brazil's academic journal ranking system (very well known in academia) | The Brazilian journal ranking system "Qualis CAPES" would dominate academic search results. |
| **Ousia** | Greek for essence/being | Studio Ousia — AI/NLP company with GitHub presence | AI company with similar domain focus. Risky. |
| **Ontiq** | Ontic + unique | GitHub user/org "ontiq"; ontiq.com domain for sale | GitHub presence exists. Domain squatted. Low-confidence ownership. |
| **Phronesis** | Aristotelian practical wisdom | Phronesis Software (company); Phronesis note-taking/knowledge app; Phronesis diagnosis tool | Multiple software products. Search results muddied. |
| **Quiddity** | Scholastic term for "whatness" | Salesforce Apex built-in enum `Quiddity`; Quiddity CRM software (Capterra); multiple Quiddity consulting companies | The Salesforce association would confuse any developer searching for it. |
| **Synesis** | Greek for understanding | Synesis Software (Australian company, active since 2000s); multiple consulting firms | Long-established software company. |
| **Ontolect** | Ontology + dialect | Ontolect Limited — dissolved UK consulting company (2015-2020); ontolect.com still resolves | Company is dissolved but name has corporate history. Domain may be recoverable. Promoted to final 3 — see below. |
| **Semalloy** | Semantic + Malloy | semalloy.com — Chinese e-commerce/spam site; @semalloy Instagram (personal account, Sara Malloy) | Domain taken by spam. While technically usable (zero tech/programming conflicts), the domain situation is annoying. Promoted to final 3 — see below. |

### Discarded — Poor Fit / Weak Names

| Name | Meaning | Reason for Discard |
|------|---------|-------------------|
| **Hyle** | Greek for "matter" (Aristotle) | Too similar to Hylo (active programming language, formerly Val). Would cause constant confusion. |
| **Morphe** | Greek for form/shape | Too generic. Also too similar to "morph" in programming (polymorphism). |
| **Gnosis** | Greek for knowledge | Too well-known and broadly used. Returns thousands of results (Gnostic religion, many companies). |
| **Sortema** | Sortal + schema | "Sort" prefix makes people think of sorting algorithms. Also sounds like "sort + tema" which is meaningless. |
| **Semlore** | Semantic + lore | "Lore" has strong fantasy/gaming connotations (D&D, Warhammer). Sounds like a game wiki, not a programming language. |
| **Kindral** | Kind (gUFO) + suffix | Sounds like "kindred" which is nice but too generic. Also sounds like a military rank (cf. "general"). |
| **Formiq** | Form + unique | Too abstract. No clear connection to ontology or data modeling. |
| **Ergon** | Greek for work/function | Too generic, used everywhere (ergonomics, multiple companies). |
| **Topos** | Greek for place | Already a concept in category theory (topos theory). Would confuse mathematicians. |
| **Pragma** | Greek for deed/act | `#pragma` is a preprocessor directive in C/C++. Instant confusion. |
| **Lexis** | Greek for word/speech | Lexis is a major legal database (LexisNexis). Completely unsearchable. |
| **Sigil** | A sign or seal | Sigils are a concept in Elixir and other languages. Too fantasy-coded. |
| **Fundal** | From "fundament" | Sounds medical ("fundal height" in obstetrics). |
| **Ontomalloy** | Ontology + Malloy | Too long (4 syllables). Clunky to say. |
| **Kindsem** | Kind + semantic | Forced compound. Sounds like a bad portmanteau. |
| **Ontosem** | Ontology + semantic | Sounds like an existing NLP system. Too academic-dry. |
| **Kindra** | Kind + suffix | Sounds like a person's name. |
| **Stratum** | Latin for layer | Too generic. Multiple companies and products. |
| **Substrate** | Underlying substance | Parity Substrate (blockchain framework). Taken. |
| **Endurant** | Ontology: entity persisting through time | Too obscure. Sounds like a brand of athletic wear. |
| **Perdural** | From "perdure" (persist through time) | Unpronounceable for non-English speakers. Too obscure. |
| **Declaron** | Declarative + suffix | Too on-the-nose and clunky. |
| **Ontalloy** | Ontology + Alloy | Similar to Semalloy but less evocative. The "alloy" connection to the Alloy specification language is nice, but "ont-" prefix is less natural than "sem-." |
| **Ontema** | Ontology + tema/schema | Bland. Sounds like a corporate product name, not a language. |
| **Sortiq** | Sortal + unique | Too short and cryptic. Sounds like a SaaS startup. |
| **Semaloy** | Semantic + Malloy (one L) | Clean namespace but visually/phonetically confusing — people would constantly wonder "is it one L or two?" Creates a homophone problem with Semalloy without the alloy-as-fusion metaphor. |
| **Sortalloy** | Sortal + alloy | Clean namespace, but "sort-alloy" reads as "sorting alloy." The sortal connection is lost. |
| **Verid** | From veridical (short form) | Too close to "Verdi" (the formal verification framework for distributed systems in Coq). |

### Discarded — Sounds Pharmaceutical

| Name | Meaning | Reason for Discard |
|------|---------|-------------------|
| **Sortalis** | Sortal + "-alis" suffix | The "-alis" suffix is extremely common in drug names (Cialis, etc.). Otherwise excellent — the ontological "sortal" reference was perfect. |
| **Veridal** | From "veridical" (truthful) | The "-idal" ending echoes pharmaceutical patterns. Also "Ver-" prefixes appear in drug names. Beautiful meaning but wrong sound. |
| **Laminar** | Relating to layers | Too close to "Lamictal" (anti-epileptic). |
| **Fabrisem** | Fabric + semantic | Sounds like a drug for Fabry disease. |

### Discarded — New Round (Fabric/Layer/Dialect Direction)

| Name | Meaning | Conflict or Reason for Discard |
|------|---------|-------------------------------|
| **Datalect** | Data + dialect | Datalect is an active tech consulting company (datalect.io, datalect.com). Search results dominated by it. |
| **Dataloom** | Data + loom | At least 4 active projects: Python ORM, data wrangling GUI, code-gen tool, AI synthetic data platform. Extremely crowded. |
| **Tapestry** | Woven narrative fabric | Apache Tapestry — active Java web framework since 2006. Unsalvageable. |
| **Fabriq** | Fabric (French-ish spelling) | Multiple companies: Fabriq industrial software, Fabriq AI, open-source Fabriq platform. |
| **Kenning** | Old Norse poetic naming device | Kenning — active open-source framework for deep learning deployment (Antmicro, Apache 2.0). |
| **Mallorn** | Tolkien's golden trees | Pendock Mallorn (accounting software since 1989); Mallorn Technology Consulting (Indian IP firm). |
| **Semkind** | Semantic + kind | Clean namespace but sounds like a forced compound. Not evocative enough. |
| **Ontoglyph** | Ontology + glyph | Clean namespace but 3 syllables that feel like 4 (ON-toh-gliff). Too visual/artistic — suggests symbols not semantics. |
| **Semloom** | Semantic + loom | Clean namespace, but LOOM is an existing ontology/knowledge-representation language (USC). Risk of seeming derivative. |
| **Ontoform** | Ontology + form | Clean namespace but bland. Sounds like a fillable PDF, not a programming language. |
| **Somalect** | Sortal/semantic + dialect | "Soma" means "body" in Greek — misleading connotation. Also sounds too close to "Somalian dialect." |

---

## Final Three Recommendations

Each name comes from a different conceptual direction, and none sound pharmaceutical.

---

### 1. Semalloy

**Direction**: Heritage — "semantic + Malloy"

**Pronunciation**: SEM-ah-loy (3 syllables)

**Why it works**:
- Directly acknowledges the Malloy heritage while signaling the semantic layer this language adds on top
- "Alloy" carries a triple resonance:
  - **Metallurgy**: An alloy fuses different metals into something stronger — this language fuses semantic ontology with relational data modeling
  - **Formal methods**: The Alloy specification language uses relational logic for software modeling — a natural intellectual cousin
  - **Malloy**: The "alloy" ending echoes the parent language's name
- Easy to say, easy to spell, easy to remember
- Immediately communicable: "It's a semantic layer over Malloy" -> "Sem-alloy"
- Sounds like a material, not a medication

**Search distinctiveness**: The only conflicts are a spam e-commerce domain (semalloy.com, Chinese site) and an Instagram account (@semalloy, personal). Zero tech/programming conflicts. Searching "Semalloy language" returns nothing competing. Domains like semalloy.dev and semalloy.io are likely available.

**Drawback**: semalloy.com is taken (by a spam site). Would need to use .dev or .io.

---

### 2. Semweave

**Direction**: Fabric — "semantic + weave" (the "Semantic Fabric" concept)

**Pronunciation**: SEM-weev (2 syllables)

**Why it works**:
- Directly evokes the "semantic fabric" concept — this language weaves threads of ontological meaning through relational data
- "Weave" connotes craft and structure: a woven fabric is both strong and intricate, made by interlacing different threads (kinds, events, situations, roles) into a coherent whole
- Short and punchy — only 2 syllables, easy to type and say
- Sounds like a craft/textile tool, not a medication
- Works naturally in sentences: "a Semweave model," "write it in Semweave," "the Semweave compiler"
- The "sem-" prefix clearly signals semantic focus to anyone in the field

**Search distinctiveness**: Excellent. Google returns only SemWare (a freeware text editor — completely different name) and sew-in weave hair tutorials. Zero tech/programming conflicts for "Semweave" as a single word. All domains likely available.

**Drawback**: "Weave" on its own is an existing DSL (for semantic HTML generation), though "Semweave" as a compound is fully clear. Some might initially hear "sem-weave" and think of textiles before programming.

---

### 3. Ontolect

**Direction**: Dialect — "ontology + dialect" (the "Linguistic Data Layer" concept)

**Pronunciation**: ON-toh-lect (3 syllables)

**Why it works**:
- Literally means "the language/dialect of ontology" — a linguistic layer for declaring what data entities are
- Captures the "Linguistic Data Layer" concept directly: this is a specialized dialect (lect) for the ontological domain (onto)
- The "-lect" suffix places it in the family of "dialect," "idiolect," "sociolect" — clearly a language/speech term, never mistaken for a drug
- Sounds sophisticated and academic without being impenetrable
- Conveys that this is a specialized way of speaking about data — not just modeling, but a whole linguistic framework

**Search distinctiveness**: Good. The only conflict is Ontolect Limited, a small UK advisory company that was dissolved in 2020 (6 years ago). The domain ontolect.com may be expired or acquirable. A programming language with documentation and community would quickly dominate search results. Zero other tech conflicts.

**Drawback**: The dissolved UK company means you don't start from a completely blank slate in Google, though the company is gone and had minimal web presence.

---

## Comparison Matrix

| Criterion | Semalloy | Semweave | Ontolect |
|-----------|----------|----------|----------|
| Evokes purpose | 5/5 | 5/5 | 5/5 |
| Google distinctiveness | 4/5 | 5/5 | 4/5 |
| Memorability | 5/5 | 5/5 | 4/5 |
| Pronounceability | 5/5 | 5/5 | 4/5 |
| Domain availability | 3/5 | 5/5 | 3/5 |
| Signals Malloy heritage | 5/5 | 0/5 | 0/5 |
| Signals semantic fabric | 2/5 | 5/5 | 2/5 |
| Signals linguistic layer | 2/5 | 2/5 | 5/5 |
| Sounds non-pharmaceutical | 5/5 | 5/5 | 5/5 |
| Works as a brand | 4/5 | 5/5 | 4/5 |

## Suggested Taglines

- **Semalloy**: "Semantic ontologies for relational data"
- **Semweave**: "The semantic fabric for your data"
- **Ontolect**: "A linguistic layer for data ontology"
