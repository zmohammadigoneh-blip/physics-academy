(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const show = id => $(id).classList.remove("hidden");
  const hide = id => $(id).classList.add("hidden");
  const note = (message, error=false) => {
    $("notice").textContent = message;
    $("notice").classList.toggle("error", error);
    show("notice");
    window.scrollTo({top:0,behavior:"smooth"});
  };
  const configured = window.SUPABASE_URL &&
    !window.SUPABASE_URL.includes("YOUR-PROJECT") &&
    window.SUPABASE_PUBLISHABLE_KEY &&
    !window.SUPABASE_PUBLISHABLE_KEY.includes("YOUR_");
  let db = null, currentClasses = [], student = null;

  function setTab(id) {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab===id));
    document.querySelectorAll(".tab-content").forEach(f => f.classList.toggle("hidden", f.id!==id));
  }
  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click",()=>setTab(b.dataset.tab)));

  if (!configured) {
    show("setupNotice");
    $("teacherLogin").querySelector("button[type=submit]").disabled = true;
  } else {
    db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:"pkce" }
    });
    initAuth();
  }

  async function initAuth() {
    db.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        hide("authPanel"); hide("teacherPanel"); hide("studentPanel"); show("recoveryPanel");
      }
    });
    const {data} = await db.auth.getSession();
    if (data.session) await openTeacherPanel();
    // If the URL contains an auth error, show a safe readable message.
    const params = new URLSearchParams(window.location.search);
    if (params.get("error_code")) note("لینک ورود یا بازیابی معتبر نیست یا منقضی شده است. یک لینک تازه درخواست کن.",true);
  }

  $("teacherLogin").addEventListener("submit", async e => {
    e.preventDefault();
    const email=$("teacherEmail").value.trim(), password=$("teacherPassword").value;
    const {error}=await db.auth.signInWithPassword({email,password});
    if(error) return note("ورود انجام نشد: "+error.message,true);
    await openTeacherPanel();
  });

  $("forgotPassword").addEventListener("click", async () => {
    const email=$("teacherEmail").value.trim();
    if(!email) return note("ابتدا ایمیل دبیر را وارد کن.",true);
    const redirectTo=window.location.origin+window.location.pathname;
    const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo});
    if(error) return note("ارسال ایمیل انجام نشد: "+error.message,true);
    note("اگر این ایمیل در سامانه ثبت شده باشد، پیام بازیابی ارسال می‌شود. صندوق Spam را هم بررسی کن.");
  });

  $("recoveryForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const p=$("newPassword").value, c=$("confirmPassword").value;
    if(p.length<8) return note("رمز باید دست‌کم ۸ نویسه داشته باشد.",true);
    if(p!==c) return note("دو رمز واردشده یکسان نیستند.",true);
    const {error}=await db.auth.updateUser({password:p});
    if(error) return note("تغییر رمز انجام نشد: "+error.message,true);
    await db.auth.signOut();
    hide("recoveryPanel");show("authPanel");
    note("رمز با موفقیت تغییر کرد. اکنون با رمز جدید وارد شو.");
    history.replaceState(null,document.title,window.location.pathname);
  });

  async function openTeacherPanel(){
    hide("authPanel");hide("studentPanel");show("teacherPanel");
    await loadTeacherData();
  }
  $("logoutBtn").addEventListener("click",async()=>{
    const {error}=await db.auth.signOut();
    if(error) return note("خروج انجام نشد: "+error.message,true);
    hide("teacherPanel");show("authPanel");note("از حساب خارج شدی.");
  });

  $("createClassForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const title=$("classTitle").value.trim();
    const {data:{user}}=await db.auth.getUser();
    const code="PHY-"+Math.random().toString(36).slice(2,7).toUpperCase();
    const {error}=await db.from("classes").insert({teacher_id:user.id,title,code});
    if(error) return note("ساخت کلاس انجام نشد: "+error.message,true);
    $("classTitle").value="";note("کلاس ساخته شد. کد کلاس: "+code);await loadTeacherData();
  });

  $("createAssignmentForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const class_id=$("assignmentClass").value;
    const title=$("assignmentTitle").value.trim();
    const description=$("assignmentDescription").value.trim();
    let parsed;
    try { parsed=parseQuestions($("assignmentQuestions").value); }
    catch(err){return note(err.message,true);}
    const {data:{user}}=await db.auth.getUser();
    const {error}=await db.from("assignments").insert({class_id,teacher_id:user.id,title,description,questions:parsed.questions,answer_key:parsed.answer_key,is_published:true});
    if(error) return note("انتشار تکلیف انجام نشد: "+error.message,true);
    $("createAssignmentForm").reset();note("تکلیف با موفقیت منتشر شد.");await loadTeacherData();
  });

  function parseQuestions(raw){
    const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(!lines.length) throw Error("دست‌کم یک سؤال وارد کن.");
    return lines.map((line,i)=>{
      const p=line.split("|").map(x=>x.trim());
      if(p.length!==5) throw Error("قالب سؤال شماره "+(i+1)+" درست نیست؛ باید متن، سه گزینه و شماره پاسخ درست داشته باشد.");
      const answer=Number(p[4]);
      if(!Number.isInteger(answer)||answer<1||answer>3) throw Error("شماره پاسخ درست سؤال "+(i+1)+" باید ۱، ۲ یا ۳ باشد.");
      return {text:p[0],options:p.slice(1,4),answer:answer-1};
    }).reduce((out,q)=>{out.questions.push({text:q.text,options:q.options});out.answer_key.push(q.answer);return out;},{questions:[],answer_key:[]});
  }

  async function loadTeacherData(){
    const {data:{user}}=await db.auth.getUser(); if(!user)return;
    const {data:classes,error}=await db.from("classes").select("id,title,code,created_at").eq("teacher_id",user.id).order("created_at",{ascending:false});
    if(error)return note("دریافت کلاس‌ها انجام نشد: "+error.message,true);
    currentClasses=classes||[];
    $("classList").innerHTML=currentClasses.length?currentClasses.map(c=>`<div class="item"><div class="item-head"><h4>${esc(c.title)}</h4><span class="code">${esc(c.code)}</span></div><p>کد را در اختیار دانش‌آموزان قرار بده.</p></div>`).join(""):"<p class='muted'>هنوز کلاسی نساخته‌ای.</p>";
    $("assignmentClass").innerHTML='<option value="">انتخاب کلاس</option>'+currentClasses.map(c=>`<option value="${c.id}">${esc(c.title)} (${esc(c.code)})</option>`).join("");
    const {data:assignments,error:ae}=await db.from("assignments").select("id,title,description,created_at,classes(title,code)").eq("teacher_id",user.id).order("created_at",{ascending:false});
    if(ae)return note("دریافت تکالیف انجام نشد: "+ae.message,true);
    $("assignmentList").innerHTML=(assignments||[]).length?assignments.map(a=>`<div class="item"><h4>${esc(a.title)}</h4><p>${esc(a.classes?.title||"")} – کد ${esc(a.classes?.code||"")}</p><p>${esc(a.description||"بدون توضیحات")}</p></div>`).join(""):"<p class='muted'>هنوز تکلیفی منتشر نشده است.</p>";
    const {data:subs,error:se}=await db.from("submissions").select("student_name,score,total,created_at,assignments(title),classes(code)").eq("teacher_id",user.id).order("created_at",{ascending:false}).limit(100);
    if(se)return note("دریافت پاسخ‌ها انجام نشد: "+se.message,true);
    $("submissionRows").innerHTML=(subs||[]).length?subs.map(s=>`<tr><td>${esc(s.student_name)}</td><td>${esc(s.classes?.code||"—")}</td><td>${esc(s.assignments?.title||"—")}</td><td>${s.score}/${s.total}</td><td>${new Date(s.created_at).toLocaleString("fa-IR")}</td></tr>`).join(""):'<tr><td colspan="5">هنوز پاسخی ثبت نشده است.</td></tr>';
  }

  $("studentEntry").addEventListener("submit",async e=>{
    e.preventDefault();
    const code=$("classCode").value.trim().toUpperCase(), name=$("studentName").value.trim();
   const {data:cl,error}=await db.rpc("get_class_by_code",{p_code:code});
    if(error||!cl)return note("کلاس پیدا نشد. کد را بررسی کن.",true);
    student={name,classInfo:cl};
    hide("authPanel");hide("teacherPanel");show("studentPanel");
    $("studentWelcome").textContent="سلام "+name+"؛ تکالیف "+cl.title;
    await loadStudentAssignments();
  });

  async function loadStudentAssignments(){
    const {data,error}=await db.rpc("get_class_assignments",{p_class_id:student.classInfo.id});
    if(error)return note("دریافت تکالیف انجام نشد: "+error.message,true);
    const list=data||[];
    $("studentAssignments").innerHTML=list.length?list.map((a,i)=>renderAssignment(a,i)).join(""):"<div class='panel'>فعلاً تکلیفی برای این کلاس منتشر نشده است.</div>";
    list.forEach(a=>{
      const form=$("assignment-"+a.id);
      form?.addEventListener("submit",async e=>{
        e.preventDefault();
        const answers=a.questions.map((q,i)=>Number(new FormData(form).get("q"+i)));
        if(answers.some(x=>!Number.isInteger(x)||x<0))return note("لطفاً به همه سؤال‌ها پاسخ بده.",true);
        const {data:result,error:saveError}=await db.rpc("submit_assignment_attempt",{p_assignment_id:a.id,p_student_name:student.name,p_answers:answers});
        if(saveError)return note("ثبت پاسخ انجام نشد: "+saveError.message,true);
        form.innerHTML=`<div class="item"><h4>پاسخ ثبت شد</h4><p>نتیجه: ${result.score} از ${result.total}</p><p>آفرین که تمرین کردی.</p></div>`;
      });
    });
  }

  function renderAssignment(a){
    let qs=Array.isArray(a.questions)?a.questions:[];
    return `<article class="panel"><h3>${esc(a.title)}</h3><p class="muted">${esc(a.description||"")}</p><form id="assignment-${a.id}">${qs.map((q,i)=>`<div class="question"><h4>${i+1}. ${esc(q.text)}</h4>${q.options.map((o,j)=>`<label class="option"><input type="radio" name="q${i}" value="${j}" required><span>${esc(o)}</span></label>`).join("")}</div>`).join("")}<button class="btn primary" type="submit">ثبت پاسخ‌ها</button></form></article>`;
  }
  $("studentBack").addEventListener("click",()=>{student=null;hide("studentPanel");show("authPanel");});
  function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
})();
