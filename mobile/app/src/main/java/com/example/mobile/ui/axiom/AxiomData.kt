package com.example.mobile.ui.axiom

enum class AxiomScreen(val label: String) {
    Home("HOME"), Notes("NOTES"), Cards("CARDS"), Plan("PLAN")
}

data class Stat(val label: String, val value: String, val unit: String, val accented: Boolean)

data class PlanItem(val time: String, val title: String, val done: Boolean, val active: Boolean)

data class Note(val title: String, val preview: String, val meta: String)

data class Flashcard(val question: String, val answer: String, val hint: String)

data class Grade(val label: String, val interval: String, val colorHex: Long)

data class AgendaBlock(val title: String, val time: String, val highlighted: Boolean)

data class AgendaDay(val day: String, val date: String, val today: Boolean, val blocks: List<AgendaBlock>)

object AxiomContent {
    val stats = listOf(
        Stat("STUDY TIME", "3.2", "hrs", accented = false),
        Stat("STREAK", "14", "days", accented = true),
        Stat("CARDS DUE", "32", "", accented = false),
        Stat("RETENTION", "91", "%", accented = false),
    )

    val plan = listOf(
        PlanItem("09:00", "Review — Linear Algebra", done = true, active = true),
        PlanItem("15:00", "Flashcards — Organic Chem", done = false, active = true),
        PlanItem("19:00", "Essay outline — Revolution", done = false, active = false),
    )

    val notes = listOf(
        Note("Reaction Mechanisms — SN1 vs SN2", "Nucleophilic substitution splits into two families…", "CHEM 201 · 2H AGO"),
        Note("Eigenvalues & Eigenvectors", "An eigenvector only scales under A, never rotates…", "MATH 240 · YESTERDAY"),
        Note("The Krebs Cycle — Overview", "Acetyl-CoA condenses with oxaloacetate to form…", "BIO 110 · 3D AGO"),
        Note("French Revolution — Causes", "Fiscal crisis, Enlightenment ideas, rigid estates…", "HIST 150 · 5D AGO"),
        Note("Big-O Notation Cheatsheet", "O(1) < O(log n) < O(n) < O(n log n) < O(n²)…", "CS 101 · 1W AGO"),
    )

    val cards = listOf(
        Flashcard(
            "What distinguishes an SN1 from an SN2 mechanism?",
            "SN1: two steps via a carbocation (rate ∝ substrate). SN2: one concerted backside attack (rate ∝ substrate × nucleophile).",
            "Steps & rate law",
        ),
        Flashcard(
            "Define Markovnikov’s rule.",
            "Adding HX to an alkene: H goes to the carbon with more hydrogens; X goes to the more substituted carbon.",
            "Where does the H go?",
        ),
        Flashcard(
            "Hybridization of carbon in benzene?",
            "sp² — three sigma bonds at 120°, one p-orbital feeding the delocalized π system.",
            "Planar ring",
        ),
    )

    val grades = listOf(
        Grade("AGAIN", "<1M", 0xFFF87171),
        Grade("HARD", "2D", 0xFFFBBF24),
        Grade("GOOD", "4D", 0L), // 0 → accent color
        Grade("EASY", "9D", 0xFF8AB8F0),
    )

    val agenda = listOf(
        AgendaDay(
            "SUN", "20", today = true,
            blocks = listOf(
                AgendaBlock("Flashcards — Organic Chemistry", "15:00 · 25M", highlighted = true),
                AgendaBlock("Essay outline — Revolution", "19:00 · 50M", highlighted = false),
            ),
        ),
        AgendaDay("MON", "21", today = false, blocks = listOf(AgendaBlock("Linear Algebra — problem set", "09:00 · 90M", highlighted = false))),
        AgendaDay("TUE", "22", today = false, blocks = listOf(AgendaBlock("Bio lecture notes review", "10:00 · 45M", highlighted = false))),
        AgendaDay("WED", "23", today = false, blocks = listOf(AgendaBlock("CS 101 — Big-O drills", "19:00 · 40M", highlighted = false))),
    )

    fun answerFor(query: String): String {
        val t = query.lowercase()
        return when {
            Regex("due|today|plan|schedul").containsMatchIn(t) ->
                "You have 3 tasks today: Linear Algebra review (done), Organic Chemistry flashcards at 15:00, and a Revolution essay outline at 19:00."
            Regex("flashcard|card|review|deck").containsMatchIn(t) ->
                "32 cards are due across Organic Chemistry and Linear Algebra. Tap CARDS to start a 25-minute review."
            Regex("summar|note").containsMatchIn(t) ->
                "“Reaction Mechanisms — SN1 vs SN2” in one line: SN2 is a single concerted backside attack; SN1 goes through a carbocation over two steps."
            Regex("timer|focus|pomodoro").containsMatchIn(t) ->
                "Your focus timer is set to 25-minute Pomodoros — hit START on the Home screen to begin."
            Regex("exam|test|quiz").containsMatchIn(t) ->
                "Next up: Biology Exam 2. The Krebs Cycle is flagged as a weak spot, with 3 study blocks scheduled this week."
            Regex("streak|progress|retention").containsMatchIn(t) ->
                "You’re on a 14-day streak (best: 21) at 91% retention. Two sessions left today."
            else ->
                "Searched your notes and decks for “$query”. Try asking what’s due, about flashcards, or for a note summary."
        }
    }
}
