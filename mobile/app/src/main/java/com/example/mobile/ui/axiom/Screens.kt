package com.example.mobile.ui.axiom

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

private val ScreenPadding = Modifier.padding(horizontal = 20.dp)

@Composable
private fun ScreenColumn(gap: Int, content: @Composable ColumnScopeAlias.() -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .then(ScreenPadding)
            .padding(top = 4.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(gap.dp),
        content = content,
    )
}

private typealias ColumnScopeAlias = androidx.compose.foundation.layout.ColumnScope

// ---------- HOME ----------

@Composable
fun HomeScreen(
    colors: AxiomColors,
    secs: Int,
    running: Boolean,
    onToggleTimer: () -> Unit,
    onResetTimer: () -> Unit,
) {
    ScreenColumn(gap = 18) {
        Column {
            Text("SUN · JUL 20", style = monoLabel(10, colors.accent, tracking = 0.22f))
            Spacer(Modifier.height(6.dp))
            Text(
                "Good morning, Rae.",
                style = TextStyle(fontFamily = Sans, fontSize = 24.sp, fontWeight = FontWeight.Medium, color = colors.text),
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "3 tasks today · streak at 14 days.",
                style = TextStyle(fontFamily = Sans, fontSize = 13.sp, color = colors.dim),
            )
        }

        StatsGrid(colors)
        TimerCard(colors, secs, running, onToggleTimer, onResetTimer)
        TodaysPlan(colors)
    }
}

@Composable
private fun StatsGrid(colors: AxiomColors) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, colors.line)
            .background(colors.line)
            .padding(0.dp),
        verticalArrangement = Arrangement.spacedBy(1.dp),
    ) {
        AxiomContent.stats.chunked(2).forEach { rowStats ->
            Row(
                modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min),
                horizontalArrangement = Arrangement.spacedBy(1.dp),
            ) {
                rowStats.forEach { st ->
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .background(colors.panel)
                            .padding(16.dp)
                    ) {
                        Text(st.label, style = monoLabel(9, colors.dim, tracking = 0.16f))
                        Spacer(Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(
                                st.value,
                                style = TextStyle(
                                    fontFamily = Mono,
                                    fontSize = 24.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = if (st.accented) colors.accent else colors.text,
                                ),
                            )
                            if (st.unit.isNotEmpty()) {
                                Text(
                                    st.unit,
                                    style = monoLabel(11, colors.dim, tracking = 0f),
                                    modifier = Modifier.padding(start = 4.dp, bottom = 3.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TimerCard(
    colors: AxiomColors,
    secs: Int,
    running: Boolean,
    onToggle: () -> Unit,
    onReset: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, colors.accent)
            .background(colors.panel)
            .padding(20.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("FOCUS TIMER", style = monoLabel(10, colors.dim, tracking = 0.2f))
            Text("POMODORO", style = monoLabel(10, colors.faint, tracking = 0.16f))
        }
        Spacer(Modifier.height(14.dp))
        val mm = (secs / 60).toString().padStart(2, '0')
        val ss = (secs % 60).toString().padStart(2, '0')
        Text(
            "$mm:$ss",
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
            style = TextStyle(
                fontFamily = Mono,
                fontSize = 42.sp,
                fontWeight = FontWeight.Light,
                letterSpacing = 0.04.em,
                color = colors.text,
            ),
        )
        Spacer(Modifier.height(16.dp))
        val progress by animateFloatAsState(
            targetValue = 1f - secs / (25f * 60f),
            animationSpec = tween(1000),
            label = "timerProgress",
        )
        ProgressLine(colors, progress)
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .border(1.dp, colors.accent)
                    .background(if (running) colors.accent else Color.Transparent)
                    .axClick(onToggle)
                    .padding(vertical = 11.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (running) "PAUSE" else "START",
                    style = monoLabel(11, if (running) colors.bg else colors.accent, tracking = 0.2f),
                )
            }
            Box(
                modifier = Modifier
                    .border(1.dp, colors.line2)
                    .axClick(onReset)
                    .padding(vertical = 11.dp, horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("RESET", style = monoLabel(11, colors.dim, tracking = 0.2f))
            }
        }
    }
}

@Composable
fun ProgressLine(colors: AxiomColors, fraction: Float) {
    Box(modifier = Modifier.fillMaxWidth().height(2.dp).background(colors.line)) {
        Box(
            modifier = Modifier
                .fillMaxWidth(fraction.coerceIn(0f, 1f))
                .height(2.dp)
                .background(colors.accent)
        )
    }
}

@Composable
private fun TodaysPlan(colors: AxiomColors) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, colors.line)
            .background(colors.panel)
    ) {
        Text(
            "TODAY'S PLAN",
            style = monoLabel(10, colors.dim, tracking = 0.2f),
            modifier = Modifier.padding(horizontal = 18.dp, vertical = 14.dp),
        )
        AxiomContent.plan.forEach { item ->
            HairlineDivider(colors.line)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp, vertical = 13.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(item.time, style = monoLabel(10, colors.dim, tracking = 0f), modifier = Modifier.width(38.dp))
                Box(
                    modifier = Modifier
                        .size(7.dp)
                        .border(1.dp, if (item.active) colors.accent else colors.line2)
                        .background(if (item.done) colors.accent else Color.Transparent)
                )
                Text(
                    item.title,
                    style = TextStyle(
                        fontFamily = Sans,
                        fontSize = 13.sp,
                        color = if (item.done) colors.faint else colors.text,
                        textDecoration = if (item.done) TextDecoration.LineThrough else TextDecoration.None,
                    ),
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

// ---------- NOTES ----------

@Composable
fun NotesScreen(colors: AxiomColors) {
    var search by remember { mutableStateOf("") }
    ScreenColumn(gap = 14) {
        Text(
            "Notes",
            style = TextStyle(fontFamily = Sans, fontSize = 22.sp, fontWeight = FontWeight.Medium, color = colors.text),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.height(IntrinsicSize.Min)) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .background(colors.panel2)
                    .border(1.dp, colors.line)
                    .padding(horizontal = 14.dp, vertical = 10.dp)
            ) {
                if (search.isEmpty()) {
                    Text("Search notes…", style = monoLabel(11, colors.dim, tracking = 0f))
                }
                BasicTextField(
                    value = search,
                    onValueChange = { search = it },
                    singleLine = true,
                    textStyle = TextStyle(fontFamily = Mono, fontSize = 11.sp, color = colors.text),
                    cursorBrush = SolidColor(colors.accent),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Box(
                modifier = Modifier
                    .width(40.dp)
                    .fillMaxHeight()
                    .border(1.dp, colors.accent)
                    .axClick { },
                contentAlignment = Alignment.Center,
            ) {
                Text("+", style = TextStyle(fontFamily = Sans, fontSize = 18.sp, color = colors.accent))
            }
        }
        val filtered = AxiomContent.notes.filter {
            search.isBlank() || it.title.contains(search, ignoreCase = true) || it.preview.contains(search, ignoreCase = true)
        }
        filtered.forEach { note ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, colors.line)
                    .background(colors.panel)
                    .drawAccentEdge(colors.accent)
                    .padding(start = 16.dp, end = 16.dp, top = 15.dp, bottom = 15.dp)
            ) {
                Text(
                    note.title,
                    style = TextStyle(fontFamily = Sans, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = colors.text),
                )
                Spacer(Modifier.height(5.dp))
                Text(
                    note.preview,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = TextStyle(fontFamily = Sans, fontSize = 12.sp, color = colors.dim),
                )
                Spacer(Modifier.height(9.dp))
                Text(note.meta, style = monoLabel(9, colors.faint, tracking = 0.14f))
            }
        }
    }
}

/** 2dp accent strip on the left edge, like the design's border-left. */
private fun Modifier.drawAccentEdge(accent: Color): Modifier =
    drawBehind { drawRect(accent, size = Size(2.dp.toPx(), size.height)) }

// ---------- CARDS ----------

@Composable
fun CardsScreen(colors: AxiomColors) {
    var idx by remember { mutableIntStateOf(0) }
    var flipped by remember { mutableStateOf(false) }
    val cards = AxiomContent.cards
    val card = cards[idx % cards.size]

    ScreenColumn(gap = 16) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("ORGANIC CHEM · DECK 03", style = monoLabel(10, colors.dim, tracking = 0.16f))
            val counter = "${((idx % cards.size) + 1).toString().padStart(2, '0')} / ${cards.size.toString().padStart(2, '0')}"
            Text(counter, style = monoLabel(10, colors.dim, tracking = 0.16f))
        }
        val progress by animateFloatAsState(
            targetValue = ((idx % cards.size) + 1) / cards.size.toFloat(),
            animationSpec = tween(300, easing = ScreenEasing),
            label = "deckProgress",
        )
        ProgressLine(colors, progress)

        // Flip card: 3D rotation, content swaps at 90°
        val rotation by animateFloatAsState(
            targetValue = if (flipped) 180f else 0f,
            animationSpec = tween(500, easing = ScreenEasing),
            label = "flip",
        )
        val showingBack = rotation > 90f
        AnimatedContent(
            targetState = idx,
            transitionSpec = {
                (fadeIn(tween(300, easing = ScreenEasing)) +
                    slideInHorizontally(tween(300, easing = ScreenEasing)) { it / 8 })
                    .togetherWith(fadeOut(tween(120)) + slideOutHorizontally(tween(120)) { -it / 12 })
            },
            label = "cardSwap",
        ) { _ ->
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 340.dp)
                    .graphicsLayer {
                        rotationY = rotation
                        cameraDistance = 12f * density
                    }
                    .border(1.dp, if (showingBack) colors.accent else colors.line2)
                    .background(colors.panel)
                    .axClick { flipped = !flipped }
                    .padding(28.dp)
            ) {
                // Mirror the content back when the card is past 90° so text reads normally
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer { if (showingBack) rotationY = 180f }
                ) {
                    Text(
                        if (showingBack) "ANSWER" else "QUESTION",
                        style = monoLabel(9, colors.faint, tracking = 0.2f),
                        modifier = Modifier.align(Alignment.TopStart),
                    )
                    Text(
                        "TAP TO FLIP",
                        style = monoLabel(9, colors.faint, tracking = 0.16f),
                        modifier = Modifier.align(Alignment.TopEnd),
                    )
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        Text(
                            if (showingBack) card.answer else card.question,
                            textAlign = TextAlign.Center,
                            style = TextStyle(
                                fontFamily = Sans,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Medium,
                                lineHeight = 27.sp,
                                color = colors.text,
                            ),
                        )
                        Text(
                            if (showingBack) "Grade your recall" else card.hint,
                            style = monoLabel(10, colors.dim, tracking = 0f),
                        )
                    }
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            AxiomContent.grades.chunked(2).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { g ->
                        val gradeColor = if (g.colorHex == 0L) colors.accent else Color(g.colorHex)
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .border(1.dp, colors.line2)
                                .axClick {
                                    idx += 1
                                    flipped = false
                                }
                                .padding(vertical = 13.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(g.label, style = monoLabel(11, gradeColor, tracking = 0.16f))
                            Spacer(Modifier.height(3.dp))
                            Text(g.interval, style = monoLabel(9, colors.faint, tracking = 0f))
                        }
                    }
                }
            }
        }
    }
}

// ---------- PLANNER ----------

@Composable
fun PlannerScreen(colors: AxiomColors) {
    ScreenColumn(gap = 14) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom,
        ) {
            Text(
                "Week 30",
                style = TextStyle(fontFamily = Sans, fontSize = 22.sp, fontWeight = FontWeight.Medium, color = colors.text),
            )
            Text("JUL 20–26", style = monoLabel(10, colors.dim, tracking = 0.14f))
        }
        AxiomContent.agenda.forEach { day ->
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.height(IntrinsicSize.Min)) {
                Column(
                    modifier = Modifier.width(44.dp).padding(top = 2.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(day.day, style = monoLabel(10, if (day.today) colors.accent else colors.dim, tracking = 0.14f))
                    Text(
                        day.date,
                        style = TextStyle(fontFamily = Mono, fontSize = 18.sp, color = if (day.today) colors.accent else colors.text),
                    )
                }
                Box(modifier = Modifier.width(1.dp).fillMaxHeight().background(colors.line))
                Column(
                    modifier = Modifier.weight(1f).padding(bottom = 6.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    day.blocks.forEach { block ->
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, if (block.highlighted) colors.accent else colors.line)
                                .background(colors.panel)
                                .padding(horizontal = 13.dp, vertical = 11.dp)
                        ) {
                            Text(
                                block.title,
                                style = TextStyle(
                                    fontFamily = Sans,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium,
                                    lineHeight = 17.5.sp,
                                    color = colors.text,
                                ),
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(block.time, style = monoLabel(9, colors.dim, tracking = 0.1f))
                        }
                    }
                }
            }
        }
    }
}
