pub(crate) fn available_test_port() -> i64 {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).expect("bind temporary port");
    let port = listener
        .local_addr()
        .expect("port should have local addr")
        .port();
    drop(listener);
    i64::from(port)
}
