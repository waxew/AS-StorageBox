package com.asteam.storagebox

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/** Single-activity entry point. Network/storage logic deliberately stays outside composables. */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme { StorageBoxApp() } }
    }
}

data class StorageItem(val name: String, val subtitle: String, val folder: Boolean)

enum class Screen(val title: String) { FILES("فایل‌های من"), SHARED("اشتراک‌گذاری شده با من"), TRASH("سطل زباله"), PROFILE("حساب کاربری") }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StorageBoxApp() {
    var screen by remember { mutableStateOf(Screen.FILES) }
    var drawerOpen by remember { mutableStateOf(false) }
    val drawerState = rememberDrawerState(if (drawerOpen) DrawerValue.Open else DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val demoItems = remember {
        listOf(
            StorageItem("اسناد", "۱۲ فایل", true),
            StorageItem("تصاویر پروژه", "۸ فایل", true),
            StorageItem("قرارداد.pdf", "2.4 MB", false),
            StorageItem("لیست قیمت.xlsx", "640 KB", false)
        )
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                Spacer(Modifier.height(24.dp))
                Icon(Icons.Default.AccountCircle, null, modifier = Modifier.size(72.dp).align(Alignment.CenterHorizontally))
                Text("کاربر StorageBox", modifier = Modifier.align(Alignment.CenterHorizontally), fontWeight = FontWeight.Bold)
                HorizontalDivider(Modifier.padding(vertical = 16.dp))
                DrawerItem("فایل‌های من", Icons.Default.Folder) { screen = Screen.FILES; scope.launch { drawerState.close() } }
                DrawerItem("اشتراک‌گذاری شده", Icons.Default.People) { screen = Screen.SHARED; scope.launch { drawerState.close() } }
                DrawerItem("سطل زباله", Icons.Default.Delete) { screen = Screen.TRASH; scope.launch { drawerState.close() } }
                DrawerItem("حساب کاربری", Icons.Default.Person) { screen = Screen.PROFILE; scope.launch { drawerState.close() } }
                Spacer(Modifier.weight(1f))
                HorizontalDivider()
                Text("گروه توسعه فناوری و نرم افزاری as Team", modifier = Modifier.padding(20.dp).align(Alignment.CenterHorizontally))
            }
        }
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(screen.title) },
                    navigationIcon = { IconButton(onClick = { scope.launch { drawerState.open() } }) { Icon(Icons.Default.Menu, "منو") } },
                    actions = { IconButton(onClick = {}) { Icon(Icons.Default.Search, "جستجو") } }
                )
            },
            floatingActionButton = {
                if (screen == Screen.FILES) ExtendedFloatingActionButton(onClick = {}, icon = { Icon(Icons.Default.Add, null) }, text = { Text("افزودن") })
            }
        ) { padding ->
            when (screen) {
                Screen.FILES -> FilesScreen(demoItems, Modifier.padding(padding))
                Screen.SHARED -> EmptyScreen("فایل‌ها و پوشه‌هایی که دیگران با شما به اشتراک می‌گذارند اینجا نمایش داده می‌شوند.", Icons.Default.People, Modifier.padding(padding))
                Screen.TRASH -> EmptyScreen("موارد حذف‌شده تا زمان حذف دائمی در این قسمت نگهداری می‌شوند.", Icons.Default.Delete, Modifier.padding(padding))
                Screen.PROFILE -> ProfileScreen(Modifier.padding(padding))
            }
        }
    }
}

@Composable
private fun DrawerItem(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    NavigationDrawerItem(label = { Text(label) }, selected = false, onClick = onClick, icon = { Icon(icon, null) }, modifier = Modifier.padding(horizontal = 12.dp))
}

@Composable
private fun FilesScreen(items: List<StorageItem>, modifier: Modifier = Modifier) {
    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Card(shape = RoundedCornerShape(22.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(20.dp)) {
                    Text("فضای ذخیره‌سازی", fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp)); LinearProgressIndicator(progress = { 0.18f }, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(8.dp)); Text("۱۸۰ مگابایت از ۱ گیگابایت")
                }
            }
        }
        item { Text("فایل‌ها و پوشه‌ها", fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp)) }
        items(items) { item ->
            Card(modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text(item.name, fontWeight = FontWeight.SemiBold) },
                    supportingContent = { Text(item.subtitle) },
                    leadingContent = { Icon(if (item.folder) Icons.Default.Folder else Icons.Default.InsertDriveFile, null) },
                    trailingContent = { IconButton(onClick = {}) { Icon(Icons.Default.MoreVert, "گزینه‌ها") } }
                )
            }
        }
    }
}

@Composable
private fun EmptyScreen(text: String, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Icon(icon, null, modifier = Modifier.size(72.dp)); Spacer(Modifier.height(18.dp)); Text(text)
    }
}

@Composable
private fun ProfileScreen(modifier: Modifier = Modifier) {
    Column(modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(Icons.Default.AccountCircle, null, modifier = Modifier.size(96.dp)); Text("حساب کاربری", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(24.dp)); OutlinedButton(onClick = {}, modifier = Modifier.fillMaxWidth()) { Text("تنظیم آدرس سرور") }
        OutlinedButton(onClick = {}, modifier = Modifier.fillMaxWidth()) { Text("درباره نرم‌افزار — نسخه 1.0.0") }
    }
}
