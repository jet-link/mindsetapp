export default function ThreadRepliesLabel() {
  return (
    <div className="thread-replies-label">
      <div className="thread-replies-label__line-col" aria-hidden="true">
        <span className="thread-replies-label__line" />
      </div>
      <p className="thread-replies-label__text">
        <span className="thread-replies-label__text-content">Replies</span>
      </p>
    </div>
  );
}
